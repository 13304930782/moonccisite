"""Package SEO modules and optionally matching frontend/SSR with baseline guards."""
import argparse
import gzip
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
BASE = '76398991a4c834a6a7e2fa82bc99a751f4913722'
PREVIOUS = 'e3fac597044d599760b63ad91f3ddfc21da3edd0'
FILES = ['src/lib/seo.js', 'src/routes/seo.js']
def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT).decode().strip()
def digest(data):
    return hashlib.sha256(data).hexdigest()
def main():
    if git('status', '--porcelain'):
        raise SystemExit('Commit source changes before packaging')
    parser=argparse.ArgumentParser()
    parser.add_argument('--with-frontend',action='store_true',help='Include the sidebar fix and matching SSR runtime')
    options=parser.parse_args()
    revision = git('rev-parse', 'HEAD')
    if options.with_frontend:
        subprocess.run(['npm','run','check'],cwd=ROOT,check=True)
    subprocess.run(['node', '--test', 'test/seo.test.js', 'test/seoPolicy.test.js', 'test/seoRecommendations.test.js'], cwd=ROOT/'server', check=True)
    entries = {'server/'+p:(ROOT/'server'/p).read_bytes() for p in FILES}
    entries['deploy.sh'] = (ROOT/'scripts/deploy-seo-recommendations.sh').read_bytes()
    baseline = {p:list(dict.fromkeys(digest(subprocess.check_output(['git','show',f'{ref}:server/{p}'],cwd=ROOT)) for ref in [BASE,PREVIOUS])) for p in FILES}
    entries['BASELINE.json'] = (json.dumps(baseline,indent=2)+'\n').encode()
    entries['MANIFEST.json'] = (json.dumps({'revision':revision,'baseline':BASE,'scope':FILES+(['dist','server/runtime'] if options.with_frontend else []),'restart':['mooncci-api'],'frontend':options.with_frontend,'dependencies':False,'migrations':False},indent=2)+'\n').encode()
    if options.with_frontend:
        for directory in ['dist','server/runtime']:
            for source in sorted((ROOT/directory).rglob('*')):
                if source.is_symlink():raise ValueError(f'Symlink in build: {source}')
                if source.is_file():entries[source.relative_to(ROOT).as_posix()]=source.read_bytes()
        if not entries.get('dist/index.html') or not entries.get('server/runtime/document.mjs'):raise ValueError('Matching frontend and runtime builds required')
    entries['REVISION'] = (revision+'\n').encode()
    entries['DEPLOY.md'] = (ROOT/'docs/SEO-RECOMMENDATIONS-DEPLOY.md').read_bytes()
    if any(b'\r' in data for name,data in entries.items() if not name.startswith(('dist/','server/runtime/'))):
        raise SystemExit('LF bytes required')
    entries['SHA256SUMS'] = ''.join(f'{digest(data)}  {name}\n' for name,data in sorted(entries.items())).encode()
    output=ROOT/'.cache'/f'mooncci-seo-recommendations-{revision[:12]}.tar.gz'
    output.parent.mkdir(exist_ok=True)
    with output.open('wb') as raw, gzip.GzipFile(filename='',fileobj=raw,mode='wb',mtime=0) as zipped, tarfile.open(fileobj=zipped,mode='w') as archive:
        for name,data in sorted(entries.items()):
            info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o755 if name=='deploy.sh' else 0o644;info.mtime=0
            archive.addfile(info,io.BytesIO(data))
    with tarfile.open(output) as archive:
        assert {m.name:archive.extractfile(m).read() for m in archive.getmembers()}==entries
    output.with_name(output.name+'.sha256').write_bytes(f'{digest(output.read_bytes())}  {output.name}\n'.encode())
    if git('status','--porcelain') or git('rev-parse','HEAD')!=revision:
        raise SystemExit('Source changed during packaging')
    print(output)
if __name__=='__main__':main()
