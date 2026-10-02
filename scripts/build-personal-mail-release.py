"""Build independently verified backend and mail-agent source archives.

These archives contain no secrets, dependencies, database dump, or automatic
installer. The frontend uses build-offline-release.py separately.
"""
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = (
    'server/src/index.js',
    'server/src/lib/mailboxSecurity.js',
    'server/src/routes/mailboxes.js',
    'server/database/migrations/202610020001_mailbox_access.sql',
)
AGENT = (
    'server/mail-agent/agent.py',
    'server/mail-agent/create_mailbox.py',
    'server/mail-agent/mooncci-mail-agent.service',
    'server/mail-agent/README.md',
)


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def lf(data):
    return data.replace(b'\r\n', b'\n')


def package(kind, paths, revision, base):
    entries = {path: lf((ROOT / path).read_bytes()) for path in paths}
    for path, data in entries.items():
        if b'\r' in data or not data:
            raise ValueError(f'Expected nonempty LF-only file: {path}')
    baseline = {}
    for path in paths:
        old = subprocess.run(['git', 'show', f'{base}:{path}'], cwd=ROOT, capture_output=True)
        baseline[path] = hashlib.sha256(lf(old.stdout)).hexdigest() if old.returncode == 0 else None
    manifest = {
        'kind': kind,
        'revision': revision,
        'base': base,
        'files': {path: {'sha256': hashlib.sha256(data).hexdigest(),
                         'baselineSha256': baseline[path]} for path, data in entries.items()},
        'automaticInstall': False,
        'includesSecrets': False,
        'includesDependencies': False,
    }
    entries['MANIFEST.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
    entries['SHA256SUMS'] = ''.join(
        f'{hashlib.sha256(data).hexdigest()}  {path}\n' for path, data in sorted(entries.items())
    ).encode()
    output = ROOT / '.cache' / f'mooncci-personal-mail-{kind}-{revision[:12]}.tar.gz'
    output.parent.mkdir(exist_ok=True)
    with tarfile.open(output, 'w:gz') as archive:
        for path, data in sorted(entries.items()):
            item = tarfile.TarInfo(path)
            item.size = len(data)
            item.mode = 0o644
            archive.addfile(item, io.BytesIO(data))
    with tarfile.open(output, 'r:gz') as archive:
        if set(archive.getnames()) != set(entries):
            raise ValueError('Unexpected archive contents')
        for path, data in entries.items():
            if archive.extractfile(path).read() != data:
                raise ValueError(f'Archive verification failed: {path}')
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    Path(str(output) + '.sha256').write_bytes(f'{digest}  {output.name}\n'.encode())
    return {'kind': kind, 'path': str(output.resolve()), 'sha256': digest,
            'files': list(paths)}


def main():
    if git('status', '--porcelain'):
        raise SystemExit('Commit source changes before packaging.')
    revision = git('rev-parse', 'HEAD')
    base = git('merge-base', 'HEAD', 'origin/codex/mail-setup-20261001')
    results = [package('backend', BACKEND, revision, base),
               package('agent', AGENT, revision, base)]
    if git('status', '--porcelain') or git('rev-parse', 'HEAD') != revision:
        raise SystemExit('Source changed while packaging.')
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
