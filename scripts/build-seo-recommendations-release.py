"""Package only the two SEO modules with baseline guards and verified LF bytes."""
import gzip
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
BASE = '76398991a4c834a6a7e2fa82bc99a751f4913722'
FILES = ['src/lib/seo.js', 'src/routes/seo.js']
def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT).decode().strip()
def digest(data):
    return hashlib.sha256(data).hexdigest()
def main():
    if git('status', '--porcelain'):
        raise SystemExit('Commit source changes before packaging')
    revision = git('rev-parse', 'HEAD')
    subprocess.run(['node', '--test', 'test/seo.test.js', 'test/seoPolicy.test.js', 'test/seoRecommendations.test.js'], cwd=ROOT/'server', check=True)
    entries = {'server/'+p:(ROOT/'server'/p).read_bytes() for p in FILES}
    entries['deploy.sh'] = (ROOT/'scripts/deploy-seo-recommendations.sh').read_bytes()
    baseline = {p:digest(subprocess.check_output(['git','show',f'{BASE}:server/{p}'],cwd=ROOT)) for p in FILES}
    entries['BASELINE.json'] = (json.dumps(baseline,indent=2)+'\n').encode()
    entries['MANIFEST.json'] = (json.dumps({'revision':revision,'baseline':BASE,'scope':FILES,'restart':['mooncci-api'],'frontend':False,'dependencies':False,'migrations':False},indent=2)+'\n').encode()
    entries['REVISION'] = (revision+'\n').encode()
    entries['DEPLOY.md'] = (ROOT/'docs/SEO-RECOMMENDATIONS-DEPLOY.md').read_bytes()
    if any(b'\r' in data for data in entries.values()):
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
