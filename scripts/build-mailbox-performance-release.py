"""Build an LF/checksum verified backend-only release; frontend uses its existing packer."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import argparse

ROOT = Path(__file__).resolve().parents[1]
BASE = 'b594edf475fa972b1c7ec54b57d2e3602457904b'
FILES = ('src/index.js', 'src/routes/admin.js', 'src/routes/mailboxes.js', 'src/lib/mailboxImap.js',
         'src/lib/mailboxImapPool.js', 'src/lib/mailboxTiming.js', 'src/lib/mailboxShutdown.js',
         'src/lib/mailboxSmtp.js', 'src/lib/mailboxSmtpPool.js', 'src/lib/mailboxPoolManager.js',
         'src/lib/mailboxPoolPolicy.js', 'src/routes/account.js')


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT).strip().decode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default=BASE)
    args = parser.parse_args()
    if git('status', '--porcelain'):
        raise SystemExit('Commit source before packaging')
    revision = git('rev-parse', 'HEAD')
    entries, manifest = {}, {}
    for relative in FILES:
        name = 'server/' + relative
        data = (ROOT / name).read_bytes().replace(b'\r\n', b'\n')
        before = subprocess.run(['git', 'show', f'{args.base}:{name}'], cwd=ROOT, capture_output=True)
        manifest[relative] = {'before': digest(before.stdout.replace(b'\r\n', b'\n')) if before.returncode == 0 else None,
                              'after': digest(data)}
        entries[name] = data
    for name, source in {'deploy.sh': 'deploy-mailbox-performance.sh', 'rollback.sh': 'rollback-mailbox-performance.sh',
                         'mode.sh': 'mode-mailbox-performance.sh', 'files.py': 'mailbox-performance-files.py'}.items():
        entries[name] = (ROOT / 'scripts' / source).read_bytes().replace(b'\r\n', b'\n')
    entries['FILES.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    entries['REVISION'] = (revision + '\n').encode()
    entries['SHA256SUMS'] = ''.join(f'{digest(data)}  {name}\n' for name, data in sorted(entries.items())).encode()
    for name, data in entries.items():
        if not data or b'\r' in data:
            raise ValueError('Expected nonempty LF file: ' + name)
    output = ROOT / '.cache' / f'mooncci-mailbox-performance-{revision[:12]}.tar.gz'
    with tarfile.open(output, 'w:gz') as archive:
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
    if git('status', '--porcelain') or git('rev-parse', 'HEAD') != revision:
        raise SystemExit('Source changed while packaging')
    print(json.dumps({'package': str(output), 'revision': revision, 'sha256': digest(output.read_bytes())}))


if __name__ == '__main__':
    main()
