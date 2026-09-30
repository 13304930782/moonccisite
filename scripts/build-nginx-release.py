"""Build and verify a scoped Nginx offline package from checked-out source."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
SPECS = {
    'origin-validator': ('ops/origin-image-validation',
                         ['patch.py', 'install.py', 'validation_probe.py', 'README.md']),
    'gateway-image-cache': ('ops/geo-gateway-preview',
                            ['image_cache.py', 'install-image-cache.py', 'PERFORMANCE-20260929.md']),
}


def build(kind, output, commit):
    directory, names = SPECS[kind]
    files = {name: (ROOT / directory / name).read_bytes().replace(b'\r\n', b'\n')
             for name in names}
    for name, data in files.items():
        if b'\r' in data:
            raise ValueError('Non-LF file: ' + name)
    files['RELEASE.json'] = (json.dumps({'kind': kind, 'source_commit': commit,
                                        'files': names}, indent=2) + '\n').encode()
    files['SHA256SUMS'] = ''.join(hashlib.sha256(files[n]).hexdigest() + '  ' + n + '\n'
                                 for n in sorted(files)).encode()
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as archive:
            for name, data in sorted(files.items()):
                info = tarfile.TarInfo(name)
                info.size = len(data)
                info.mode = 0o644
                archive.addfile(info, io.BytesIO(data))
    payload = buffer.getvalue()
    with tarfile.open(fileobj=io.BytesIO(payload), mode='r:gz') as archive:
        if set(archive.getnames()) != set(files):
            raise ValueError('Archive file list mismatch')
        for item in archive:
            if not item.isfile() or archive.extractfile(item).read() != files[item.name]:
                raise ValueError('Archive verification failed')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(payload)
    sha = hashlib.sha256(payload).hexdigest()
    Path(str(output) + '.sha256').write_bytes((sha + '  ' + output.name + '\n').encode())
    print(json.dumps({'archive': str(output), 'sha256': sha, 'verified': True}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kind', choices=sorted(SPECS))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--commit', help='Source revision; defaults to current git HEAD')
    args = parser.parse_args()
    commit = args.commit or subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=str(ROOT)).decode().strip()
    build(args.kind, args.output, commit)
