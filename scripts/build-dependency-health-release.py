"""Build a verified frontend + explicitly scoped backend release without dependency changes."""
import hashlib,io,json,subprocess,sys,tarfile
from pathlib import Path
root=Path(__file__).resolve().parent.parent
subprocess.run([sys.executable,str(root/'scripts/build-offline-release.py')],check=True)
release=json.loads((root/'.cache/offline-release.json').read_text())
with tarfile.open(release['package']) as a:entries={m.name:a.extractfile(m).read() for m in a.getmembers()}
files=['src/index.js','src/lib/dependencyHealth.js','src/routes/dependencyHealth.js']
known=json.loads((root/'scripts/dependency-health-baseline.json').read_text())
baseline={n:known.get(n,[None]) for n in files}
for n in files:
 data=(root/'server'/n).read_text(encoding='utf-8-sig').replace('\r\n','\n').encode();entries['server/'+n]=data;baseline[n].append(hashlib.sha256(data).hexdigest())
entries['deploy.sh']=(root/'scripts/deploy-dependency-health.sh').read_text(encoding='utf-8-sig').replace('\r\n','\n').encode()
entries['BASELINE.json']=(json.dumps(baseline,indent=2)+'\n').encode()
entries['BACKEND_FILES']=(''.join(n+'\n' for n in files)).encode()
entries.pop('SHA256SUMS');entries['SHA256SUMS']=''.join(hashlib.sha256(b).hexdigest()+'  '+n+'\n' for n,b in sorted(entries.items())).encode()
out=root/'.cache'/f"mooncci-dependency-health-{release['revision'][:12]}.tar.gz"
with tarfile.open(out,'w:gz') as a:
 for n,b in sorted(entries.items()):
  i=tarfile.TarInfo(n);i.size=len(b);i.mode=0o755 if n.endswith('.sh') else 0o644;a.addfile(i,io.BytesIO(b))
with tarfile.open(out) as a:
 for n,b in entries.items():
  assert a.extractfile(n).read()==b
  if n.endswith('.sh') or n in ['REVISION','SHA256SUMS','BACKEND_FILES','BASELINE.json']:assert b'\r' not in b
sha=hashlib.sha256(out.read_bytes()).hexdigest();Path(str(out)+'.sha256').write_bytes((sha+'  '+out.name+'\n').encode())
result={**release,'package':str(out),'bytes':out.stat().st_size,'sha256':sha,'scope':'dependency-health-no-migrations'}
(root/'.cache/dependency-health-release.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(result,indent=2))
