"""Build a checked offline bundle for the API, SEO Nginx snippet and frontend."""
import gzip
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "server/src/routes/upload.js": ROOT / "server/src/routes/upload.js",
    "server/src/routes/seo.js": ROOT / "server/src/routes/seo.js",
    "server/src/lib/seo.js": ROOT / "server/src/lib/seo.js",
    "nginx-blog-seo.conf": ROOT / "scripts/nginx-blog-seo.conf",
    "deploy.sh": ROOT / "scripts/deploy-security-seo.sh",
}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def main():
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    if subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT).strip():
        raise SystemExit("Commit source changes before packaging")
    entries = {}
    for name, source in FILES.items():
        data = source.read_bytes().replace(b"\r\n", b"\n")
        if b"\r" in data:
            raise ValueError(f"Invalid line endings: {name}")
        entries[name] = data
    for source in sorted((ROOT / "dist").rglob("*")):
        if source.is_symlink():
            raise ValueError(f"Symlink in frontend: {source}")
        if source.is_file():
            name = source.relative_to(ROOT).as_posix()
            if any(part.startswith(".") for part in source.relative_to(ROOT / "dist").parts):
                raise ValueError(f"Hidden frontend file: {source}")
            entries[name] = source.read_bytes()
    if not entries.get("dist/index.html"):
        raise ValueError("Frontend build missing")
    entries["REVISION"] = (revision + "\n").encode("ascii")
    entries["MANIFEST.json"] = (json.dumps({"revision": revision,"scope": ["api-upload", "api-seo", "nginx-seo", "frontend"], "migrations": False, "dependency_install": False, "restart": ["mooncci-api"]}, indent=2) + "\n").encode()
    entries["SHA256SUMS"] = "".join(f"{digest(data)}  {name}\n" for name, data in sorted(entries.items())).encode("ascii")
    output = ROOT / ".cache" / f"mooncci-security-seo-{revision[:12]}.tar.gz"
    output.parent.mkdir(exist_ok=True)
    with output.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode="w") as archive:
                for name, data in sorted(entries.items()):
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    info.mode = 0o755 if name == "deploy.sh" else 0o644
                    info.mtime = 0
                    archive.addfile(info, io.BytesIO(data))
    with tarfile.open(output) as archive:
        assert {item.name: archive.extractfile(item).read() for item in archive.getmembers()} == entries
    sidecar = output.with_name(output.name + ".sha256")
    sidecar.write_bytes(f"{digest(output.read_bytes())}  {output.name}\n".encode("ascii"))
    print(output)
    print(sidecar)

if __name__ == "__main__":
    main()
