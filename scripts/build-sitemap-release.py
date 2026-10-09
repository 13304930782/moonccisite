import hashlib
import io
from pathlib import Path
import subprocess
import tarfile

root = Path(__file__).resolve().parents[1]
revision = subprocess.check_output(['git', 'rev-parse', '--short=12', 'HEAD'], cwd=root, text=True).strip()
files = {'refresh-sitemap.py':'scripts/refresh-sitemap.py', 'mooncci-sitemap.service':'scripts/mooncci-sitemap.service',
         'mooncci-sitemap.timer':'scripts/mooncci-sitemap.timer', 'deploy.sh':'scripts/deploy-sitemap.sh',
         'rollback.sh':'scripts/rollback-sitemap.sh', 'sitemap-index.xml':'public/sitemap-index.xml'}
entries = {name:(root/source).read_bytes().replace(b'\r\n', b'\n') for name,source in files.items()}
assert all(b'\r' not in data for data in entries.values())
entries['SHA256SUMS'] = ''.join(hashlib.sha256(data).hexdigest()+'  '+name+'\n' for name,data in entries.items()).encode()
archive = root/'.cache'/('mooncci-sitemap-'+revision+'.tar.gz')
with tarfile.open(archive, 'w:gz') as output:
    for name,data in entries.items():
        info = tarfile.TarInfo(name)
        info.size = len(data)
        info.mode = 0o644
        output.addfile(info,io.BytesIO(data))
with tarfile.open(archive) as check:
    assert {item.name:check.extractfile(item).read() for item in check} == entries
archive.with_name(archive.name+'.sha256').write_bytes((hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n').encode())
print(archive)
