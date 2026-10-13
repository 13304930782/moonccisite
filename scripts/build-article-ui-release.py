"""Build verified, scoped frontend/SSR and reader archives from a clean commit."""
import argparse
import hashlib
import io
import json
import os
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def tree(folder):
    entries = {}
    for file in sorted((ROOT / folder).rglob("*")):
        if file.is_symlink():
            raise ValueError(f"Symlink: {file}")
        if file.is_file():
            name = file.relative_to(ROOT).as_posix()
            if any(part.startswith(".") for part in file.relative_to(ROOT / folder).parts) or any(c.isspace() for c in name):
                raise ValueError(f"Unexpected output path: {name}")
            entries[name] = file.read_bytes()
    return entries


def bundle(mode, revision, baseline):
    entries = tree("dist")
    if not entries.get("dist/index.html"):
        raise ValueError("Frontend build missing")
    if mode == "main":
        entries.update(tree("server/runtime"))
        for name in ["document.mjs", "styles.json", "home.css"]:
            if not entries.get("server/runtime/" + name):
                raise ValueError(f"SSR output missing: {name}")
        styles = json.loads(entries["server/runtime/styles.json"])
        for group in styles.values():
            for file in group.get("css", []) + group.get("js", []):
                if "dist" + file not in entries:
                    raise ValueError(f"SSR references missing frontend output: {file}")
    for target, source in [("deploy.sh", "deploy-article-ui.sh"), ("rollback.sh", "rollback-article-ui.sh")]:
        entries[target] = (ROOT / "scripts" / source).read_bytes().replace(b"\r\n", b"\n")
    entries["TARGET"] = (mode + "\n").encode()
    entries["REVISION"] = (revision + "\n").encode()
    entries["BASELINE.json"] = (json.dumps(baseline, indent=2) + "\n").encode()
    entries["MANIFEST.json"] = (json.dumps({"revision": revision, "target": mode,
        "scope": ["frontend", "public-document-runtime"] if mode == "main" else ["frontend"],
        "restarts": ["mooncci-api"] if mode == "main" else [],
        "backend_source": False, "configuration_changes": False,
        "dependency_install": False, "migrations": []}, indent=2) + "\n").encode()
    entries["SHA256SUMS"] = "".join(f"{sha(data)}  {name}\n" for name, data in sorted(entries.items())).encode()
    for name in ["deploy.sh", "rollback.sh", "TARGET", "REVISION", "BASELINE.json", "MANIFEST.json", "SHA256SUMS"]:
        if b"\r" in entries[name]:
            raise ValueError(f"Non-LF metadata: {name}")
    output = ROOT / ".cache" / f"mooncci-article-ui-{mode}-{revision[:12]}.tar.gz"
    output.parent.mkdir(exist_ok=True)
    with tarfile.open(output, "w:gz") as archive:
        for name, data in sorted(entries.items()):
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o755 if name.endswith(".sh") else 0o644
            archive.addfile(info, io.BytesIO(data))
    with tarfile.open(output) as archive:
        actual = {item.name: archive.extractfile(item).read() for item in archive.getmembers() if item.isfile()}
        if actual != entries or len(actual) != len(archive.getmembers()):
            raise ValueError("Archive content differs from scoped source")
        for line in actual["SHA256SUMS"].decode().splitlines():
            expected, name = line.split("  ", 1)
            if sha(actual[name]) != expected:
                raise ValueError(f"Checksum mismatch: {name}")
    sidecar = Path(str(output) + ".sha256")
    digest = sha(output.read_bytes())
    sidecar.write_bytes(f"{digest}  {output.name}\n".encode())
    if b"\r" in sidecar.read_bytes() or sidecar.read_text().split("  ", 1)[0] != sha(output.read_bytes()):
        raise ValueError("Invalid archive sidecar")
    return {"archive": str(output), "sha256": digest, "files": len(entries), "bytes": output.stat().st_size}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", required=True, type=Path, help="Fresh read-only production hash snapshot")
    args = parser.parse_args()
    if git("status", "--porcelain"):
        raise SystemExit("Commit source changes before packaging")
    revision = git("rev-parse", "HEAD")
    baseline = json.loads(args.baseline.read_text(encoding="utf-8"))
    required = {"index", "runtime", "reader_index", "prerequisites"}
    if set(baseline) != required or not baseline["prerequisites"]:
        raise ValueError("Incomplete production baseline")
    for value in [baseline[k] for k in required - {"prerequisites"}] + list(baseline["prerequisites"].values()):
        if len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
            raise ValueError("Invalid production checksum")
    subprocess.run(["npm.cmd" if os.name == "nt" else "npm", "run", "build"], cwd=ROOT, check=True)
    if git("status", "--porcelain") or git("rev-parse", "HEAD") != revision:
        raise SystemExit("Source changed during build")
    result = {"revision": revision, "packages": {mode: bundle(mode, revision, baseline) for mode in ["main", "reader"]}}
    (ROOT / ".cache/article-ui-release.json").write_bytes((json.dumps(result, indent=2) + "\n").encode())
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
