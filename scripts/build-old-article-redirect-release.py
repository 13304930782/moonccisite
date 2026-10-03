"""Build a scoped offline Nginx release for four old WordPress articles."""

from __future__ import annotations

import gzip
import hashlib
import io
from pathlib import Path
import tarfile


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".cache" / "old-article-redirect-release"
FILES = {
    "moooncci-cn-article-redirects.conf": ROOT / "ops" / "moooncci-cn-article-redirects.conf",
    "deploy.sh": ROOT / "ops" / "deploy-moooncci-cn-article-redirects.sh",
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    payload = {name: path.read_bytes() for name, path in FILES.items()}
    for name, data in payload.items():
        data.decode("utf-8")
        if b"\r" in data:
            raise ValueError(f"{name} must use LF line endings")

    payload["SHA256SUMS"] = "".join(
        f"{sha256(data)}  {name}\n" for name, data in sorted(payload.items())
    ).encode("ascii")
    archive = OUTPUT / "moooncci-old-article-redirects.tar.gz"
    with archive.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode="w") as tar:
                for name, data in sorted(payload.items()):
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    info.mode = 0o755 if name == "deploy.sh" else 0o644
                    info.mtime = 0
                    tar.addfile(info, io.BytesIO(data))

    with tarfile.open(archive, "r:gz") as tar:
        actual = {item.name: tar.extractfile(item).read() for item in tar.getmembers()}
    if actual != payload:
        raise ValueError("archive content mismatch")

    sidecar = archive.with_name(archive.name + ".sha256")
    sidecar.write_bytes(f"{sha256(archive.read_bytes())}  {archive.name}\n".encode("ascii"))
    print(archive)
    print(sidecar)


if __name__ == "__main__":
    main()
