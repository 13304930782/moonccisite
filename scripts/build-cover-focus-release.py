"""Build scoped cover-focus frontend/SSR and reader offline releases; no SQL/API changes."""
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
    "src/routes/articleDrafts.js", "src/routes/bookmarks.js", "src/routes/posts.js",
    "src/routes/series.js", "src/routes/upload.js",
]
SOURCES = ['index.html', 'src/app/components/ArticlePresentation.tsx', 'src/app/components/CoverDisplayPreviews.tsx', 'src/app/components/CoverFramingDialog.tsx', 'src/app/lib/coverPalette.ts', 'src/styles/article-detail.css', 'src/styles/cover-framing.css', 'src/styles/index.css', 'src/styles/mobile-inputs.css', 'src/app/components/ArticleReview.tsx', 'src/app/components/BlogCard.tsx', 'src/app/lib/responsiveImage.ts', 'src/styles/editorial.css', 'src/app/components/CardCoverImage.tsx', 'src/styles/card-cover.css', 'src/app/pages/AdminWritePage.tsx', 'src/app/pages/SeriesPage.tsx']
PREREQUISITES = ["src/index.js", "src/lib/publicDocument.js",
    "src/services/articleWorkflow.js", "src/services/articleSummary.js",
    "src/worker.js", "src/jobs/contentScheduler.js", "package.json",
    "package-lock.json", "ecosystem.config.cjs"]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", "-c", "safe.directory=" + str(ROOT), *args],
                                   cwd=ROOT, text=True).strip()


def lf(path):
    data = path.read_bytes().replace(b"\r\n", b"\n")
    if b"\r" in data:
        raise ValueError("Unexpected CR byte: " + str(path))
    return data


def safe_name(name):
    return bool(re.fullmatch(r"[A-Za-z0-9_@+.,/-]+", name)) and all(
        part not in ("", ".", "..") for part in name.split("/")) and not name.startswith("/")


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
    expected = {name.removeprefix("node_modules/"): item for name, item in lock["packages"].items() if name}
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
    required = {"version", "captured_at", "backend", "prerequisites", "main", "reader", "pm2", "verify_articles", "original_covers", "frontend_source"}
    if set(baseline) != required or baseline["version"] != 1:
        raise ValueError("Unexpected production baseline structure")
    if set(baseline["backend"]) != set(UNCHANGED_BACKEND) or set(baseline["prerequisites"]) != set(PREREQUISITES):
        raise ValueError("Unexpected backend baseline scope")
    if set(baseline["main"]) != {"index", "runtime_document", "runtime_styles", "runtime_home_css"}:
        raise ValueError("Incomplete main entry baseline")
    if set(baseline["reader"]) != {"index", "node"} or not re.fullmatch(r"/[A-Za-z0-9_./+-]+", baseline["reader"]["node"]):
        raise ValueError("Reader needs an explicitly inspected absolute Node executable")
    if set(baseline["frontend_source"]) != set(SOURCES):
        raise ValueError("Unexpected frontend source baseline scope")
    values = [v for v in baseline["frontend_source"].values() if v is not None] + list(baseline["prerequisites"].values()) + list(baseline["main"].values()) + [baseline["reader"]["index"]]
    values += [value for value in baseline["backend"].values() if value is not None]
    if any(not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{64}", value) for value in values):
        raise ValueError("Baseline must contain raw SHA-256 hashes")
    stamp = datetime.datetime.fromisoformat(baseline["captured_at"].replace("Z", "+00:00"))
    age = (datetime.datetime.now(datetime.timezone.utc) - stamp).total_seconds()
    if stamp.tzinfo is None or age < -300 or age > 86400:
        raise ValueError("Capture a fresh read-only production baseline within 24 hours")
    articles = baseline["verify_articles"]
    if not isinstance(articles, list) or not {17, 18}.issubset({item.get("id") for item in articles}) or any(
            set(item) != {"id", "cover"} or type(item["id"]) is not int or item["id"] < 1 or type(item["cover"]) is not bool for item in articles):
        raise ValueError("Confirm current published articles including 17 and 18")
    for item in baseline["original_covers"]:
        if set(item) != {"id", "file", "sha256"} or not safe_name(item["file"]) or not item["file"].startswith("uploads/") or not re.fullmatch(r"[a-f0-9]{64}", item["sha256"]):
            raise ValueError("Unexpected original cover baseline")
    fields = {"max_memory_restart", "node_args", "exec_interpreter", "pm_exec_path", "pm_cwd"}
    if set(baseline["pm2"]) != {"mooncci-api", "mooncci-worker"}:
        raise ValueError("Incomplete sanitized PM2 baseline")
    for name, config in baseline["pm2"].items():
        if set(config) != fields or config["max_memory_restart"] != (450 if name == "mooncci-api" else 300) * 1024 * 1024:
            raise ValueError("Unexpected PM2 memory configuration")
    # Bind the source-only prerequisites. Production manifests/configuration are
    # independently pinned by raw hashes and are never replaced by this package.
    for name, digest in baseline["prerequisites"].items():
        if name.startswith("src/") and sha(lf(ROOT / "server" / name)) != digest:
            raise ValueError("Local prerequisite differs from the inspected live bytes: " + name)


def normalized_baseline(source):
    fields = ["max_memory_restart", "node_args", "exec_interpreter", "pm_exec_path", "pm_cwd"]
    result = {key: source[key] for key in ["version", "captured_at", "backend", "prerequisites", "main", "reader", "verify_articles", "original_covers", "frontend_source"]}
    result["pm2"] = source.get("pm2") or {item["name"]: {field: item[field] for field in fields} for item in source["processes"]}
    selected = [item for item in source["verify_articles"] if item["id"] in (17, 18)]
    no_cover = next((item for item in source["verify_articles"] if not item["cover"]), None)
    if no_cover and no_cover not in selected:
        selected.insert(0, no_cover)
    result["verify_articles"] = selected
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
        entries.update(tree(ROOT / "server/runtime", "server/runtime"))
        entries.update(renderer_dependencies(ROOT / ".cache/document-deps/node_modules"))
        for name in SOURCES:
            entries["source/" + name] = lf(ROOT / name)
        for name in ["document.mjs", "styles.json", "home.css"]:
            if not entries.get("server/runtime/" + name):
                raise ValueError("Missing runtime output: " + name)
    for source, dest in [("deploy-cover-focus.sh", "deploy.sh"), ("rollback-cover-focus.sh", "rollback.sh"),
                         ("verify-cover-focus-release.cjs", "verify.cjs")]:
        entries[dest] = lf(ROOT / "scripts" / source)
    entries["BASELINE.json"] = (json.dumps(baseline, indent=2) + "\n").encode()
    entries["SOURCE_FILES"] = ("\n".join(SOURCES) + "\n").encode() if target == "main" else b""
    manifest = {"version": 1, "release": "cover-focus", "target": target, "revision": revision,
        "backend_files": [], "source_files": SOURCES if target == "main" else [],
        "migrations": [],
        "migration_runner": None,
        "restarts": ["mooncci-api"] if target == "main" else [],
        "dependency_install": False, "configuration_changes": False,
        "isolated_renderer_lock": sha(lf(ROOT / "scripts/document-runtime/package-lock.json")) if target == "main" else None}
    entries["MANIFEST.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    entries["FILELIST"] = ("\n".join(sorted([*entries, "FILELIST", "SHA256SUMS"])) + "\n").encode()
    entries["SHA256SUMS"] = "".join(f"{sha(data)}  {name}\n" for name, data in sorted(entries.items())).encode()
    asset_references(entries, target == "main")
    for name, data in entries.items():
        if not safe_name(name):
            raise ValueError("Unsafe archive path: " + name)
        if name in {"BASELINE.json", "SOURCE_FILES", "MANIFEST.json", "FILELIST", "SHA256SUMS"} or name.endswith((".sh", ".sql")):
            if b"\r" in data or data and not data.endswith(b"\n"):
                raise ValueError("Non-LF release metadata: " + name)
    output = ROOT / ".cache" / f"mooncci-cover-focus-{target}-{revision[:12]}.tar.gz"
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
    if git("status", "--porcelain"):
        raise SystemExit("Commit all source and release tooling before packaging")
    revision = git("rev-parse", "HEAD")
    baseline = normalized_baseline(json.loads(args.baseline.read_text(encoding="utf-8")))
    validate_baseline(baseline)
    subprocess.run(["npm.cmd" if os.name == "nt" else "npm", "run", "build"], cwd=ROOT, check=True)
    if git("status", "--porcelain") or git("rev-parse", "HEAD") != revision:
        raise SystemExit("Source changed during local build")
    result = {"revision": revision, "packages": {target: bundle(target, revision, baseline) for target in ["main", "reader"]}}
    if git("status", "--porcelain") or git("rev-parse", "HEAD") != revision:
        raise SystemExit("Source changed during packaging")
    (ROOT / ".cache/cover-focus-release.json").write_bytes((json.dumps(result, indent=2) + "\n").encode())
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
