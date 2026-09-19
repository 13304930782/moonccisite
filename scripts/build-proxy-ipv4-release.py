"""Backend-only ipv4 hotfix, independent of unshipped reader features."""
import hashlib,io,json,subprocess,tarfile
from pathlib import Path
root=Path(__file__).resolve().parent.parent
if subprocess.check_output(['git','status','--porcelain'],cwd=root).strip():raise RuntimeError('Commit local changes before building')
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
subprocess.run(['node','--test','server/test/dependencyHealth.test.js','server/test/proxyTransport.test.js','server/test/googleProxy.test.js','server/test/githubProxy.test.js'],cwd=root,check=True)
files=['src/lib/proxyTransport.js','src/lib/dependencyHealth.js','src/lib/socialProviders.js','src/lib/googleIdentity.js']
known=json.loads((root/'scripts/proxy-ipv4-baseline.json').read_text())
entries={}
for name in files:
 data=(root/'server'/name).read_text(encoding='utf-8-sig').encode()
 known.setdefault(name,[None]).append(hashlib.sha256(data).hexdigest())
 entries['server/'+name]=data
entries.update({'deploy.sh':(root/'scripts/deploy-proxy-ipv4.sh').read_bytes(),'REVISION':(revision+'\n').encode(),'BACKEND_FILES':('\n'.join(files)+'\n').encode(),'BASELINE.json':(json.dumps(known,indent=2)+'\n').encode()})
entries['SHA256SUMS']=''.join(hashlib.sha256(b).hexdigest()+'  '+n+'\n' for n,b in sorted(entries.items())).encode()
for n,b in entries.items():assert b'\r' not in b
out=root/'.cache'/f'mooncci-proxy-ipv4-{revision[:12]}.tar.gz'
with tarfile.open(out,'w:gz') as a:
 for n,b in sorted(entries.items()):
  m=tarfile.TarInfo(n);m.size=len(b);m.mode=0o755 if n.endswith('.sh') else 0o644;a.addfile(m,io.BytesIO(b))
with tarfile.open(out) as a:
 assert set(a.getnames())==set(entries)
 for n,b in entries.items():assert a.extractfile(n).read()==b
sha=hashlib.sha256(out.read_bytes()).hexdigest();Path(str(out)+'.sha256').write_bytes((sha+'  '+out.name+'\n').encode())
result={'revision':revision,'package':str(out),'bytes':out.stat().st_size,'sha256':sha,'scope':'four-backend-files-no-migrations-no-frontend'}
(root/'.cache/proxy-ipv4-release.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(result,indent=2))
