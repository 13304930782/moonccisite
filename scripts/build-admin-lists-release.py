"""Scoped offline release: current frontend + ONLY server/src/routes/admin.js."""
import hashlib
import io
import json
import subprocess
import sys
import tarfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
subprocess.run([sys.executable, str(root / 'scripts/build-offline-release.py')], check=True)
release = json.loads((root / '.cache/offline-release.json').read_text())
revision = release['revision']
with tarfile.open(release['package']) as archive:
    entries = {entry.name: archive.extractfile(entry).read() for entry in archive.getmembers()}
entries['deploy.sh'] = (root / 'scripts/deploy-admin-lists.sh').read_bytes().replace(b'\r\n', b'\n')
entries['server/src/routes/admin.js'] = (root / 'server/src/routes/admin.js').read_bytes()
entries.pop('SHA256SUMS')
entries['SHA256SUMS'] = ''.join(f'{hashlib.sha256(data).hexdigest()}  {name}\n' for name, data in sorted(entries.items())).encode('utf-8')
if subprocess.check_output(['git', 'status', '--porcelain'], cwd=root).strip() or subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip() != revision:
    raise SystemExit('Source changed; release aborted')
output = root / '.cache' / f'mooncci-admin-lists-{revision[:12]}.tar.gz'
with tarfile.open(output, 'w:gz') as archive:
    for name, data in sorted(entries.items()):
        info = tarfile.TarInfo(name)
        info.size = len(data)
        info.mode = 0o755 if name.endswith('.sh') else 0o644
        archive.addfile(info, io.BytesIO(data))
with tarfile.open(output) as archive:
    for name, data in entries.items():
        assert archive.extractfile(name).read() == data
digest = hashlib.sha256(output.read_bytes()).hexdigest()
Path(str(output) + '.sha256').write_bytes(f'{digest}  {output.name}\n'.encode('ascii'))
result = { 'revision': revision, 'package': str(output), 'bytes': output.stat().st_size, 'sha256': digest, 'scope': 'admin-lists' }
(root / '.cache/offline-release.json').write_bytes(json.dumps(result, indent=2).encode('utf-8'))
print(json.dumps(result, indent=2))
