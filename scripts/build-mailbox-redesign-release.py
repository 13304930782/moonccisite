"""Build a checksum-verified, single-route mailbox backend release."""
import argparse
import gzip
import hashlib
import io
import json
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTE = 'src/routes/mailboxes.js'
BASELINE = 'ef063c91305378222a706f22ef74fc310b5a2b6d8ad37ea259922322de43cd29'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--commit', required=True)
    args = parser.parse_args()
    entries = {
        'server/' + ROUTE: (ROOT / 'server' / ROUTE).read_bytes().replace(b'\r\n', b'\n'),
        'deploy.sh': (ROOT / 'scripts/deploy-mailbox-redesign.sh').read_bytes().replace(b'\r\n', b'\n'),
        'rollback.sh': (ROOT / 'scripts/rollback-mailbox-redesign.sh').read_bytes().replace(b'\r\n', b'\n'),
        'BASELINE': (BASELINE + '\n').encode(),
        'REVISION': (args.commit + '\n').encode(),
    }
    entries['SHA256SUMS'] = ''.join(f'{digest(data)}  {name}\n' for name, data in sorted(entries.items())).encode()
    output = ROOT / '.cache' / f'mooncci-mailbox-redesign-{args.commit[:12]}.tar.gz'
    output.parent.mkdir(exist_ok=True)
    with output.open('wb') as raw:
        with gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w') as archive:
                for name, data in sorted(entries.items()):
                    assert b'\r' not in data
                    item = tarfile.TarInfo(name)
                    item.size = len(data)
                    item.mode = 0o755 if name.endswith('.sh') else 0o644
                    archive.addfile(item, io.BytesIO(data))
    with tarfile.open(output) as archive:
        assert set(archive.getnames()) == set(entries)
        for name, data in entries.items():
            assert archive.extractfile(name).read() == data
    Path(str(output) + '.sha256').write_bytes(f'{digest(output.read_bytes())}  {output.name}\n'.encode())
    print(json.dumps({'archive': str(output), 'sha256': digest(output.read_bytes()), 'verified': True}))

if __name__ == '__main__':
    main()
