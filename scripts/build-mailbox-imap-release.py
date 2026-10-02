"""Build a scoped offline backend release with isolated pure-JS IMAP dependencies."""
import argparse
import gzip
import hashlib
import io
import json
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINE = '8d29932fc12492d0ba769b1ad6df0f02fef2c113d3603d97ea3a5e1d53c3c772'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--commit', required=True)
    args = parser.parse_args()
    entries = {}
    for name in ['server/src/routes/mailboxes.js', 'server/src/lib/mailboxImap.js',
                 'scripts/deploy-mailbox-imap.sh', 'scripts/rollback-mailbox-imap.sh']:
        data = (ROOT / name).read_bytes()
        if name.endswith('.sh'):
            data = data.replace(b'\r\n', b'\n')
            assert b'\r' not in data
        entries[name] = data
    vendor = ROOT / '.cache/mailbox-runtime/node_modules'
    if not (vendor / 'imapflow/package.json').exists() or not (vendor / 'mailparser/package.json').exists():
        raise SystemExit('Install the pinned mailbox runtime into .cache/mailbox-runtime first.')
    for file in sorted(vendor.rglob('*')):
        if file.is_symlink():
            raise ValueError(f'Symlink in vendor tree: {file}')
        if file.is_file() and '.bin' not in file.relative_to(vendor).parts:
            entries['server/src/lib/mailbox-vendor/node_modules/' + file.relative_to(vendor).as_posix()] = file.read_bytes()
    entries['BASELINE'] = (BASELINE + '\n').encode()
    entries['REVISION'] = (args.commit + '\n').encode()
    entries['SHA256SUMS'] = ''.join(f'{digest(data)}  {name}\n' for name, data in sorted(entries.items())).encode()
    output = ROOT / '.cache' / f'mooncci-mailbox-imap-{args.commit[:12]}.tar.gz'
    output.parent.mkdir(exist_ok=True)
    with output.open('wb') as raw:
        with gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w') as archive:
                for name, data in sorted(entries.items()):
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
