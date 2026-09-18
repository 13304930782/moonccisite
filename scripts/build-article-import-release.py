"""Build a verified frontend + explicitly scoped backend/dependency release."""
import hashlib,io,json,subprocess,sys,tarfile
from pathlib import Path
root=Path(__file__).resolve().parent.parent
subprocess.run([sys.executable,str(root/'scripts/build-offline-release.py')],check=True)
release=json.loads((root/'.cache/offline-release.json').read_text())
with tarfile.open(release['package']) as a:entries={m.name:a.extractfile(m).read() for m in a.getmembers()}
files=['src/routes/articleDrafts.js','src/lib/articleImport.js','src/lib/articleImportFetch.js','src/lib/articleImportConvert.js','package.json','package-lock.json']
baseline=json.loads((root/'scripts/article-import-baseline.json').read_text())
for n in files:
 data=(root/'server'/n).read_text(encoding='utf-8-sig').replace('\r\n','\n').encode();entries['server/'+n]=data;baseline[n].append(hashlib.sha256(data).hexdigest())
for dep in ['turndown','@mixmark-io/domino']:
 for file in (root/'server/node_modules'/dep).rglob('*'):
  if file.is_symlink():raise ValueError('Symlink dependency is not allowed')
  if file.is_file():entries['dependencies/'+file.relative_to(root/'server/node_modules').as_posix()]=file.read_bytes()
entries['deploy.sh']=(root/'scripts/deploy-article-import.sh').read_text(encoding='utf-8-sig').replace('\r\n','\n').encode()
entries['BASELINE.json']=(json.dumps(baseline,indent=2)+'\n').encode()
entries['BACKEND_FILES']=(''.join(n+'\n' for n in files)).encode()
entries.pop('SHA256SUMS');entries['SHA256SUMS']=''.join(hashlib.sha256(b).hexdigest()+'  '+n+'\n' for n,b in sorted(entries.items())).encode()
out=root/'.cache'/f"mooncci-article-import-{release['revision'][:12]}.tar.gz"
with tarfile.open(out,'w:gz') as a:
 for n,b in sorted(entries.items()):
  i=tarfile.TarInfo(n);i.size=len(b);i.mode=0o755 if n.endswith('.sh') else 0o644;a.addfile(i,io.BytesIO(b))
with tarfile.open(out) as a:
 for n,b in entries.items():
  assert a.extractfile(n).read()==b
  if n.endswith('.sh') or n in ['REVISION','SHA256SUMS','BACKEND_FILES','BASELINE.json']:assert b'\r' not in b
sha=hashlib.sha256(out.read_bytes()).hexdigest();Path(str(out)+'.sha256').write_bytes((sha+'  '+out.name+'\n').encode())
result={**release,'package':str(out),'bytes':out.stat().st_size,'sha256':sha,'scope':'article-import-and-review-no-migrations'}
(root/'.cache/article-import-release.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(result,indent=2))
