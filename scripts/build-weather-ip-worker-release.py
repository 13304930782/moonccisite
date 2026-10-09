"""Package only the IP lookup process isolation fix, with verified LF metadata."""
import gzip
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "server/src/lib/weatherGlobalIp.js": ROOT / "server/src/lib/weatherGlobalIp.js",
    "server/src/lib/weatherGlobalIpWorker.js": ROOT / "server/src/lib/weatherGlobalIpWorker.js",
    "deploy.sh": ROOT / "scripts/deploy-weather-ip-worker.sh",
    "rollback.sh": ROOT / "scripts/rollback-weather-ip-worker.sh",
}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    if subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT).strip():
        raise SystemExit("Commit source changes before packaging")
    entries = {name: source.read_bytes().replace(b"\r\n", b"\n") for name, source in FILES.items()}
    assert all(b"\r" not in data for data in entries.values())
    entries["REVISION"] = (revision + "\n").encode()
    entries["MANIFEST.json"] = (json.dumps({"revision": revision, "scope": ["isolated-offline-ip-lookup"], "restart": ["mooncci-api"], "frontend": False, "migrations": False, "dependency_install": False, "database_changed": False}, indent=2) + "\n").encode()
    entries["SHA256SUMS"] = "".join(f"{sha(data)}  {name}\n" for name, data in sorted(entries.items())).encode()
    output = ROOT / ".cache" / f"mooncci-weather-ip-worker-{revision[:12]}.tar.gz"
    with output.open("wb") as raw, gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as zipped, tarfile.open(fileobj=zipped, mode="w") as archive:
        for name, data in sorted(entries.items()):
            info = tarfile.TarInfo(name)
            info.size, info.mtime, info.mode = len(data), 0, 0o755 if name.endswith(".sh") else 0o644
            archive.addfile(info, io.BytesIO(data))
    with tarfile.open(output) as archive:
        assert {member.name: archive.extractfile(member).read() for member in archive.getmembers()} == entries
    sidecar = output.with_name(output.name + ".sha256")
    sidecar.write_bytes(f"{sha(output.read_bytes())}  {output.name}\n".encode())
    print(output)
    print(sidecar)

if __name__ == "__main__":
    main()
