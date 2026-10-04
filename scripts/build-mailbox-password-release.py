"""Build verified, scoped offline packages for the mailbox password API and mail agent."""
import gzip
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = 'fb3d32aadb06ae5228f2d98ce7d9f82728eb70e8'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT).strip().decode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def lf(data):
    return data.replace(b'\r\n', b'\n')


def package(kind, revision, files, previous, deploy, rollback):
    entries = {name: lf((ROOT / name).read_bytes()) for name in files}
    entries['deploy.sh'] = lf((ROOT / deploy).read_bytes())
    entries['rollback.sh'] = lf((ROOT / rollback).read_bytes())
    baseline = lf(subprocess.check_output(['git', 'show', f'{BASE}:{previous}'], cwd=ROOT))
    entries['BASELINE'] = (digest(baseline) + '\n').encode()
    entries['REVISION'] = (revision + '\n').encode()
    for name, data in entries.items():
        if not data or b'\r' in data:
            raise ValueError(f'File must be nonempty LF bytes: {name}')
    entries['SHA256SUMS'] = ''.join(f'{digest(data)}  {name}\n' for name, data in sorted(entries.items())).encode()
    output = ROOT / '.cache' / f'mooncci-mailbox-password-{kind}-{revision[:12]}.tar.gz'
    output.parent.mkdir(exist_ok=True)
    with output.open('wb') as raw:
        with gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w') as archive:
                for name, data in sorted(entries.items()):
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    info.mode = 0o755 if name.endswith('.sh') else 0o644
                    archive.addfile(info, io.BytesIO(data))
    with tarfile.open(output) as archive:
        if set(archive.getnames()) != set(entries):
            raise ValueError('Package contents mismatch')
        for name, data in entries.items():
            if archive.extractfile(name).read() != data:
                raise ValueError(f'Package bytes mismatch: {name}')
    Path(str(output) + '.sha256').write_bytes(f'{digest(output.read_bytes())}  {output.name}\n'.encode())
    return {'package': str(output.resolve()), 'sha256': digest(output.read_bytes()), 'files': list(files)}


def main():
    if git('status', '--porcelain'):
        raise SystemExit('Commit source changes before building release packages')
    revision = git('rev-parse', 'HEAD')
    subprocess.run(['git', 'merge-base', '--is-ancestor', BASE, revision], cwd=ROOT, check=True)
    results = {
        'backend': package('backend', revision,
            ['server/src/routes/mailboxes.js', 'server/scripts/migrate-mailbox-passwords.js',
             'server/database/migrations/202610040001_mailbox_password_changes.sql'],
            'server/src/routes/mailboxes.js', 'scripts/deploy-mailbox-password-backend.sh',
            'scripts/rollback-mailbox-password-backend.sh'),
        'agent': package('agent', revision,
            ['server/mail-agent/agent.py', 'server/mail-agent/update_mailbox.py'],
            'server/mail-agent/agent.py', 'scripts/deploy-mailbox-password-agent.sh',
            'scripts/rollback-mailbox-password-agent.sh'),
    }
    if git('status', '--porcelain') or git('rev-parse', 'HEAD') != revision:
        raise SystemExit('Source changed during packaging')
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
