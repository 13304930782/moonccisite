"""Build a verified frontend + explicitly scoped backend release without dependency changes."""
import hashlib,io,json,subprocess,sys,tarfile
from pathlib import Path
root=Path(__file__).resolve().parent.parent
stage=int(sys.argv[1]) if len(sys.argv)>1 else 1
if stage not in [1,2,3]:raise ValueError('Stage must be 1, 2 or 3')
subprocess.run([sys.executable,str(root/'scripts/build-offline-release.py')],check=True)
release=json.loads((root/'.cache/offline-release.json').read_text())
with tarfile.open(release['package']) as a:entries={m.name:a.extractfile(m).read() for m in a.getmembers()}
files=['src/routes/posts.js','src/lib/articleDiscovery.js']
if stage>=2:files+=['src/routes/settings.js','src/lib/blogPages.js']
if stage>=3:files+=['src/index.js','src/routes/seo.js','src/lib/seo.js']
known=json.loads((root/'scripts/blog-foundation-baseline.json').read_text())
baseline={n:known.get(n,[None]) for n in files}
for n in files:
 data=(root/'server'/n).read_text(encoding='utf-8-sig').replace('\r\n','\n').encode();entries['server/'+n]=data;baseline[n].append(hashlib.sha256(data).hexdigest())
entries['deploy.sh']=(root/'scripts/deploy-blog-foundation.sh').read_text(encoding='utf-8-sig').replace('\r\n','\n').encode()
if stage==3:
 for name in ['nginx-blog-seo.conf','enable-blog-seo.sh','verify-blog-seo.mjs']:
  entries[name]=(root/'scripts'/name).read_text(encoding='utf-8-sig').replace('\r\n','\n').encode()
entries['BASELINE.json']=(json.dumps(baseline,indent=2)+'\n').encode()
entries['BACKEND_FILES']=(''.join(n+'\n' for n in files)).encode()
entries.pop('SHA256SUMS');entries['SHA256SUMS']=''.join(hashlib.sha256(b).hexdigest()+'  '+n+'\n' for n,b in sorted(entries.items())).encode()
out=root/'.cache'/f"mooncci-blog-foundation-{stage}-{release['revision'][:12]}.tar.gz"
with tarfile.open(out,'w:gz') as a:
 for n,b in sorted(entries.items()):
  i=tarfile.TarInfo(n);i.size=len(b);i.mode=0o755 if n.endswith('.sh') else 0o644;a.addfile(i,io.BytesIO(b))
with tarfile.open(out) as a:
 for n,b in entries.items():
  assert a.extractfile(n).read()==b
  if n.endswith('.sh') or n in ['REVISION','SHA256SUMS','BACKEND_FILES','BASELINE.json']:assert b'\r' not in b
sha=hashlib.sha256(out.read_bytes()).hexdigest();Path(str(out)+'.sha256').write_bytes((sha+'  '+out.name+'\n').encode())
result={**release,'package':str(out),'bytes':out.stat().st_size,'sha256':sha,'scope':'blog-foundation-no-migrations'}
(root/f'.cache/blog-foundation-{stage}-release.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(result,indent=2))
