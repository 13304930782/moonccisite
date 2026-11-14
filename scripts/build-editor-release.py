"""Build the editor release using the managed SSR deployment workflow."""
import argparse
import datetime
import hashlib
import io
import json
import os
import posixpath
import re
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UNCHANGED_BACKEND = [
    "src/lib/articleCoverCrop.js", "src/lib/articleConflict.js",
    "src/lib/articlePublishing.js", "src/lib/articleRevisions.js",
    "src/routes/bookmarks.js", "src/routes/posts.js",
    "src/routes/series.js", "src/routes/upload.js", "src/routes/seo.js",
]
SOURCES = []
BACKEND = ['src/routes/admin.js', 'src/routes/articleDrafts.js', 'src/routes/articleSeo.js', 'src/services/articleSummary.js', 'src/services/articleTranslationAI.js']
RUNNER = None
MIGRATION = None
BACKEND_FILES = BACKEND
PACKAGE_BACKEND = BACKEND
PREREQUISITES = ["src/index.js", "src/lib/publicDocument.js",
    "src/services/articleWorkflow.js",
    "src/worker.js", "src/jobs/contentScheduler.js", "package.json",
    "package-lock.json", "ecosystem.config.cjs"]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", "-c", "safe.directory=" + str(ROOT), *args],
                                   cwd=ROOT, universal_newlines=True).strip()


def changed_sources():
    return [line for line in git("status", "--porcelain").splitlines() if line != "?? outputs/"]


def lf(path):
    data = path.read_bytes().replace(b"\r\n", b"\n")
    if b"\r" in data:
        raise ValueError("Unexpected CR byte: " + str(path))
    return data


def source_bytes(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("Nonregular allowlisted source: " + str(path))
    # Uploaded design icons are binary; normalize only textual source bytes.
    return path.read_bytes() if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".avif"} else lf(path)


def safe_name(name):
    return bool(re.fullmatch(r"[A-Za-z0-9_@+.,/-]+", name)) and all(
        part not in ("", ".", "..") for part in name.split("/")) and not name.startswith("/")


def runtime_state(name):
    return bool(re.fullmatch(r"(?:worker|deployment)\.json(?:\.\d+\.tmp)?", name))


def tree(folder, prefix, skip_hidden=False):
    result = {}
    for file in sorted(folder.rglob("*")):
        if file.is_symlink():
            raise ValueError("Symlink in release input: " + str(file))
        if not file.is_file():
            if not file.is_dir():
                raise ValueError("Nonregular release input: " + str(file))
            continue
        relative = file.relative_to(folder)
        if any(part.startswith(".") for part in relative.parts):
            if skip_hidden:
                continue
            raise ValueError("Hidden build output: " + str(file))
        name = prefix + "/" + relative.as_posix()
        if not safe_name(name):
            raise ValueError("Unsafe output name: " + name)
        result[name] = file.read_bytes()
    return result


def renderer_dependencies(folder):
    lock = json.loads((ROOT / "scripts/document-runtime/package-lock.json").read_text())
    expected = {name[len("node_modules/"):] if name.startswith("node_modules/") else name: item for name, item in lock["packages"].items() if name}
    if not (folder / "jsdom/package.json").is_file():
        raise ValueError("Prepare the existing locked isolated jsdom dependencies first")
    modules = {}
    for directory in sorted(folder.iterdir()):
        if directory.name.startswith("."):
            continue
        candidates = list(directory.iterdir()) if directory.name.startswith("@") else [directory]
        for module in candidates:
            key = module.relative_to(folder).as_posix()
            if key not in expected or module.is_symlink() or not module.is_dir():
                raise ValueError("Unexpected renderer dependency: " + key)
            package = json.loads((module / "package.json").read_text())
            if package["version"] != expected[key]["version"]:
                raise ValueError("Renderer lock version differs: " + key)
            modules[key] = module
    if set(modules) != set(expected):
        raise ValueError("Incomplete renderer lock dependency closure")
    entries = {}
    for key, module in modules.items():
        files = tree(module, "server/runtime/node_modules/" + key, skip_hidden=True)
        if any(name.endswith(".node") for name in files):
            raise ValueError("Windows native renderer dependency cannot be deployed")
        entries.update(files)
    return entries


def validate_baseline(baseline):
    required = {"version", "captured_at", "backend", "prerequisites", "main", "pm2", "verify_articles", "frontend_source"}
    if set(baseline) != required or baseline["version"] != 1:
        raise ValueError("Unexpected production baseline structure")
    if set(baseline["backend"]) != set(UNCHANGED_BACKEND + BACKEND_FILES) or set(baseline["prerequisites"]) != set(PREREQUISITES):
        raise ValueError("Unexpected backend baseline scope")
    if set(baseline["main"]) != {"index", "asset_manifest", "runtime_document", "runtime_styles", "runtime_home_css"}:
        raise ValueError("Incomplete main entry baseline")
    if set(baseline["frontend_source"]) != set(SOURCES):
        raise ValueError("Unexpected frontend source baseline scope")
    values = [v for v in baseline["frontend_source"].values() if v is not None] + list(baseline["prerequisites"].values()) + list(baseline["main"].values())
    values += [value for value in baseline["backend"].values() if value is not None]
    if any(not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{64}", value) for value in values):
        raise ValueError("Baseline must contain raw SHA-256 hashes")
    stamp_text = baseline["captured_at"].replace("Z", "+0000").replace("+00:00", "+0000")
    stamp_format = "%Y-%m-%dT%H:%M:%S.%f%z" if "." in stamp_text else "%Y-%m-%dT%H:%M:%S%z"
    stamp = datetime.datetime.strptime(stamp_text, stamp_format)
    age = (datetime.datetime.now(datetime.timezone.utc) - stamp).total_seconds()
    if stamp.tzinfo is None or age < -300 or age > 86400:
        raise ValueError("Capture a fresh read-only production baseline within 24 hours")
    if not isinstance(baseline["verify_articles"], list) or not baseline["verify_articles"] or any(type(item) is not int or item < 1 for item in baseline["verify_articles"]):
        raise ValueError("Confirm at least one public article ID")
    fields = {"max_memory_restart", "node_args", "exec_interpreter", "pm_exec_path", "pm_cwd"}
    if set(baseline["pm2"]) != {"mooncci-api", "mooncci-worker"}:
        raise ValueError("Incomplete sanitized PM2 baseline")
    for name, config in baseline["pm2"].items():
        if set(config) != fields or config["max_memory_restart"] != (450 if name == "mooncci-api" else 300) * 1024 * 1024:
            raise ValueError("Unexpected PM2 memory configuration")
    # Bind the source-only prerequisites. Production manifests/configuration are
    # independently pinned by raw hashes and are never replaced by this package.
    for name, digest in baseline["prerequisites"].items():
        if name.startswith("src/") and digest not in (sha((ROOT / "server" / name).read_bytes()), sha(lf(ROOT / "server" / name))):
            raise ValueError("Local prerequisite differs from the inspected live bytes: " + name)


def normalized_baseline(source):
    fields = ["max_memory_restart", "node_args", "exec_interpreter", "pm_exec_path", "pm_cwd"]
    result = {key: source[key] for key in ["version", "captured_at", "backend", "prerequisites", "main", "verify_articles", "frontend_source"]}
    result["pm2"] = source.get("pm2") or {item["name"]: {field: item[field] for field in fields} for item in source["processes"]}
    return result


def asset_references(entries, main):
    html = entries["dist/index.html"].decode()
    references = re.findall(r'(?:src|href)=["\'](/[^"\']+)["\']', html)
    if main:
        styles = json.loads(entries["server/runtime/styles.json"])
        for group in styles.values():
            references += group.get("css", []) + group.get("js", [])
        css = entries["server/runtime/home.css"].decode()
        references += re.findall(r'url\(["\']?(/[^)"\']+)', css)
    for name, data in entries.items():
        if name.startswith("dist/") and name.endswith((".js", ".css")):
            references += ["/" + posixpath.normpath(posixpath.join(posixpath.dirname(name[5:]), value)) for value in
                re.findall(r'["\'(](\.\.?/[^"\')\s]+\.(?:js|css|woff2?|png|svg|webp|jpg|avif))', data.decode())]
    for reference in references:
        file = reference.split("?", 1)[0].split("#", 1)[0]
        if file.startswith("/assets/") and "dist" + file not in entries:
            raise ValueError("Missing packaged asset reference: " + file)


def bundle(target, revision, baseline):
    entries = tree(ROOT / "dist", "dist")
    if not entries.get("dist/index.html"):
        raise ValueError("Frontend build missing")
    if target == "main":
        runtime = tree(ROOT / "server/runtime", "server/runtime")
        if any(runtime_state(name[len("server/runtime/"):] if name.startswith("server/runtime/") else name) for name in runtime):
            raise ValueError("Runtime state must never be packaged")
        entries.update(runtime)
        entries.update(renderer_dependencies(ROOT / ".cache/document-deps/node_modules"))
        for name in PACKAGE_BACKEND:
            entries["server/" + name] = lf(ROOT / "server" / name)
        for name in SOURCES:
            entries["source/" + name] = source_bytes(ROOT / name)
        for name in ["document.mjs", "styles.json", "home.css"]:
            if not entries.get("server/runtime/" + name):
                raise ValueError("Missing runtime output: " + name)
    for source, dest in [("deploy-editor-release.sh", "deploy.sh"), ("rollback-editor-release.sh", "rollback.sh"),
                         ("verify-editor-release.cjs", "verify.cjs")]:
        entries[dest] = lf(ROOT / "scripts" / source)
    entries["BASELINE.json"] = (json.dumps(baseline, indent=2) + "\n").encode()
    entries["SOURCE_FILES"] = ("\n".join(SOURCES) + "\n").encode() if target == "main" else b""
    entries["BACKEND_FILES"] = ("\n".join(BACKEND_FILES) + "\n").encode() if target == "main" else b""
    manifest = {"version": 1, "release": "editor", "target": target, "revision": revision,
        "backend_files": BACKEND_FILES if target == "main" else [], "source_files": SOURCES if target == "main" else [],
        "migrations": [],
        "migration_runner": None,
        "restarts": ["mooncci-api"] if target == "main" else [],
        "runtime_install": "managed-files-atomic-entry" if target == "main" else None,
        "dependency_install": False, "configuration_changes": False,
        "isolated_renderer_lock": sha(lf(ROOT / "scripts/document-runtime/package-lock.json")) if target == "main" else None}
    entries["MANIFEST.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    entries["FILELIST"] = ("\n".join(sorted([*entries, "FILELIST", "SHA256SUMS"])) + "\n").encode()
    entries["SHA256SUMS"] = "".join(f"{sha(data)}  {name}\n" for name, data in sorted(entries.items())).encode()
    asset_references(entries, target == "main")
    for name, data in entries.items():
        if not safe_name(name):
            raise ValueError("Unsafe archive path: " + name)
        if name in {"BASELINE.json", "SOURCE_FILES", "BACKEND_FILES", "MANIFEST.json", "FILELIST", "SHA256SUMS"} or name.endswith((".sh", ".sql")):
            if b"\r" in data or data and not data.endswith(b"\n"):
                raise ValueError("Non-LF release metadata: " + name)
    output = ROOT / ".cache" / f"mooncci-editor-{target}-{revision[:12]}.tar.gz"
    output.parent.mkdir(exist_ok=True)
    with tarfile.open(output, "w:gz") as archive:
        for name, data in sorted(entries.items()):
            info = tarfile.TarInfo(name)
            info.size, info.mode, info.mtime = len(data), 0o755 if name.endswith(".sh") else 0o644, 0
            archive.addfile(info, io.BytesIO(data))
    with tarfile.open(output) as archive:
        members = archive.getmembers()
        if len(members) != len(entries) or any(not item.isfile() or not safe_name(item.name) for item in members):
            raise ValueError("Nonregular or duplicate archive entry")
        actual = {item.name: archive.extractfile(item).read() for item in members}
        if actual != entries:
            raise ValueError("Archived bytes differ from scoped inputs")
        for line in actual["SHA256SUMS"].decode().splitlines():
            digest, name = line.split("  ", 1)
            if sha(actual[name]) != digest:
                raise ValueError("Archived checksum mismatch: " + name)
    digest = sha(output.read_bytes())
    sidecar = Path(str(output) + ".sha256")
    sidecar.write_bytes(f"{digest}  {output.name}\n".encode())
    if sidecar.read_bytes() != f"{sha(output.read_bytes())}  {output.name}\n".encode():
        raise ValueError("Invalid archive checksum sidecar")
    return {"archive": str(output), "sha256": digest, "files": len(entries), "bytes": output.stat().st_size}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    args = parser.parse_args()
    if changed_sources():
        raise SystemExit("Commit all source and release tooling before packaging")
    revision = git("rev-parse", "HEAD")
    baseline = normalized_baseline(json.loads(args.baseline.read_text(encoding="utf-8")))
    validate_baseline(baseline)
    subprocess.run(["npm.cmd" if os.name == "nt" else "npm", "run", "build"], cwd=ROOT, check=True)
    if changed_sources() or git("rev-parse", "HEAD") != revision:
        raise SystemExit("Source changed during local build")
    result = {"revision": revision, "packages": {target: bundle(target, revision, baseline) for target in ["main"]}}
    if changed_sources() or git("rev-parse", "HEAD") != revision:
        raise SystemExit("Source changed during packaging")
    (ROOT / ".cache/editor-release.json").write_bytes((json.dumps(result, indent=2) + "\n").encode())
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
