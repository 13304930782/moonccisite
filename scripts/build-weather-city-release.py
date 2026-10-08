"""Build a verified frontend and matching SSR runtime release for weather city fixes."""
import gzip
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "server/src/lib/weatherGeocoder.js": ROOT / "server/src/lib/weatherGeocoder.js",
    "server/src/lib/weatherNetworkCity.js": ROOT / "server/src/lib/weatherNetworkCity.js",
    "server/src/lib/weatherBudget.js": ROOT / "server/src/lib/weatherBudget.js",
    "server/src/routes/weatherMood.js": ROOT / "server/src/routes/weatherMood.js",
    "deploy.sh": ROOT / "scripts/deploy-weather-city.sh",
    "rollback.sh": ROOT / "scripts/rollback-weather-city.sh",
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
    for source in sorted((ROOT / "server/runtime").rglob("*")):
        if source.is_file(): entries[source.relative_to(ROOT).as_posix()] = source.read_bytes()
    dependency_root = ROOT / ".cache/document-deps/node_modules"
    if not (dependency_root / "jsdom/package.json").exists():
        raise ValueError("Isolated jsdom runtime dependencies missing")
    for source in sorted(dependency_root.rglob("*")):
        if source.is_file() and ".bin" not in source.parts:
            if source.suffix == ".node": raise ValueError("Native dependency requires Linux build")
            entries["server/runtime/node_modules/" + source.relative_to(dependency_root).as_posix()] = source.read_bytes()
    if not entries.get("dist/index.html"):
        raise ValueError("Frontend build missing")
    entries["REVISION"] = (revision + "\n").encode("ascii")
    entries["MANIFEST.json"] = (json.dumps({"revision": revision,"scope": ["public-document-runtime", "weather-city-query", "weather-city-geocoder", "weather-network-city", "weather-upstream-budget", "frontend"], "migrations": False, "dependency_install": False, "restart": ["mooncci-api"]}, indent=2) + "\n").encode()
    entries["SHA256SUMS"] = "".join(f"{digest(data)}  {name}\n" for name, data in sorted(entries.items())).encode("ascii")
    output = ROOT / ".cache" / f"mooncci-weather-city-{revision[:12]}.tar.gz"
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
