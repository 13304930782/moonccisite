"""Small, verified backend-only archive; no install, restart, dependencies or DB writes."""
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
BASE = '906d308b17551e59ca8907886383f51fb6c33c32'
FILES = ['src/index.js', 'src/config/mail-client.json', 'src/lib/mailClient.js', 'src/routes/mailSetup.js']
def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()
def main():
    if git('status', '--porcelain'):
        raise SystemExit('Commit source changes before packaging.')
    revision = git('rev-parse', 'HEAD')
    entries = {f'server/{name}': (ROOT / 'server' / name).read_bytes() for name in FILES}
    baseline = {}
    for name in FILES:
        result = subprocess.run(['git', 'show', BASE + ':server/' + name], cwd=ROOT, capture_output=True)
        baseline[name] = hashlib.sha256(result.stdout).hexdigest() if result.returncode == 0 else None
    entries['BASELINE.json'] = (json.dumps(baseline, indent=2) + '\n').encode()
    entries['MANIFEST.json'] = (json.dumps({'revision': revision, 'baseline': BASE, 'files': FILES, 'frontend': False, 'dependencies': False, 'migrations': False, 'restart': 'verified API only; manual'}, indent=2) + '\n').encode()
    entries['check-backend.cjs'] = (ROOT / 'scripts/check-mail-setup-backend.cjs').read_bytes()
    entries['MAIL-SETUP-DEPLOY.md'] = (ROOT / 'MAIL-SETUP-DEPLOY.md').read_bytes()
    for file in (ROOT / 'ops/mail-setup').glob('*.template'):
        entries['nginx/' + file.name] = file.read_bytes()
    assert all(b'\r' not in data for data in entries.values()), 'LF-only release files required'
    entries['SHA256SUMS'] = ''.join(hashlib.sha256(data).hexdigest() + '  ' + name + '\n' for name, data in sorted(entries.items())).encode()
    output = ROOT / '.cache' / ('mooncci-mail-backend-' + revision[:12] + '.tar.gz')
    output.parent.mkdir(exist_ok=True)
    with tarfile.open(output, 'w:gz') as archive:
        for name, data in sorted(entries.items()):
            item = tarfile.TarInfo(name); item.size = len(data); item.mode = 0o644
            archive.addfile(item, io.BytesIO(data))
    with tarfile.open(output) as archive:
        assert set(archive.getnames()) == set(entries)
        for name, data in entries.items():
            assert archive.extractfile(name).read() == data
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    Path(str(output) + '.sha256').write_bytes((digest + '  ' + output.name + '\n').encode())
    print(json.dumps({'revision': revision, 'package': str(output), 'sha256': digest, 'verified': True}))
if __name__ == '__main__':
    main()
