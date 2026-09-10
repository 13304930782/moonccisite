"""Verified offline frontend + scoped OAuth backend, no env/dependency/historical SQL replacement."""
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
    entries = {item.name: archive.extractfile(item).read() for item in archive.getmembers()}
entries['deploy.sh'] = (root / 'scripts/deploy-article-drafts.sh').read_bytes().replace(b'\r\n', b'\n')
files = ['src/index.js', 'src/routes/articleDrafts.js', 'src/routes/admin.js', 'src/routes/posts.js', 'database/migrations/202609110001_article_drafts.sql']
for name in files:
    entries['server/' + name] = (root / 'server' / name).read_bytes().replace(b'\r\n', b'\n')
entries['server/scripts/migrate-article-drafts.js'] = (root / 'server/scripts/migrate-article-drafts.js').read_bytes().replace(b'\r\n', b'\n')
entries['BACKEND_FILES'] = ''.join(name + '\n' for name in files).encode()
entries.pop('SHA256SUMS')
entries['SHA256SUMS'] = ''.join(f'{hashlib.sha256(data).hexdigest()}  {name}\n' for name, data in sorted(entries.items())).encode()
if subprocess.check_output(['git', 'status', '--porcelain'], cwd=root).strip() or subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip() != revision:
    raise SystemExit('Source changed; release aborted')
output = root / '.cache' / f'mooncci-article-drafts-{revision[:12]}.tar.gz'
with tarfile.open(output, 'w:gz') as archive:
    for name, data in sorted(entries.items()):
        item = tarfile.TarInfo(name)
        item.size = len(data)
        item.mode = 0o755 if name.endswith('.sh') else 0o644
        archive.addfile(item, io.BytesIO(data))
with tarfile.open(output) as archive:
    for name, data in entries.items():
        assert archive.extractfile(name).read() == data
        if name.endswith(('.sh', '.sql')) or name in ['SHA256SUMS', 'BACKEND_FILES']:
            assert b'\r' not in data
digest = hashlib.sha256(output.read_bytes()).hexdigest()
Path(str(output) + '.sha256').write_bytes(f'{digest}  {output.name}\n'.encode())
result = {'revision': revision, 'package': str(output), 'bytes': output.stat().st_size, 'sha256': digest, 'scope': 'article-drafts-with-additive-migration'}
(root / '.cache/offline-release.json').write_bytes(json.dumps(result, indent=2).encode())
print(json.dumps(result, indent=2))
