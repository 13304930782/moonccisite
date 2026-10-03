"""Build a checked, reader-only offline bundle without secrets or frontend assets."""
import gzip
import hashlib
import io
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def digest(data):
    return hashlib.sha256(data).hexdigest()

def main():
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    if subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT).strip():
        raise SystemExit("Commit source changes before packaging")
    entries = {
        "server.mjs": (ROOT / "edge/reader/server.mjs").read_bytes().replace(b"\r\n", b"\n"),
        "deploy.sh": (ROOT / "scripts/deploy-reader-ssrf.sh").read_bytes().replace(b"\r\n", b"\n"),
        "REVISION": (revision + "\n").encode("ascii"),
    }
    if any(b"\r" in data for data in entries.values()):
        raise ValueError("Release metadata and scripts must be LF")
    entries["SHA256SUMS"] = "".join(f"{digest(data)}  {name}\n" for name, data in sorted(entries.items())).encode("ascii")
    output = ROOT / ".cache" / f"mooncci-reader-ssrf-{revision[:12]}.tar.gz"
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
    output.with_name(output.name + ".sha256").write_bytes(f"{digest(output.read_bytes())}  {output.name}\n".encode("ascii"))
    print(output)

if __name__ == "__main__":
    main()
