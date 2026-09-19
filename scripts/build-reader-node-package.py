"""Build isolated reader package reusing the exact deployed frontend assets."""
import hashlib,io,json,subprocess,tarfile
from pathlib import Path
root=Path(__file__).resolve().parent.parent
revision=subprocess.check_output(['git','-c','safe.directory='+root.as_posix(),'rev-parse','HEAD'],cwd=root,text=True).strip()
if subprocess.check_output(['git','-c','safe.directory='+root.as_posix(),'status','--porcelain'],cwd=root).strip():raise RuntimeError('Commit validated source before building')
subprocess.run(['node','--test','test/read-router.test.cjs'],cwd=root,check=True)
release=json.loads((root/'.cache/maintenance-release.json').read_text())
archive=Path(release['package'])
if hashlib.sha256(archive.read_bytes()).hexdigest()!=release['sha256']:raise ValueError('Frontend package checksum mismatch')
entries={}
with tarfile.open(archive) as t:
 for m in t.getmembers():
  if m.isfile() and m.name.startswith('payload/frontend/assets/'):
   entries['dist/'+m.name[len('payload/frontend/'):]]=t.extractfile(m).read()
if not entries:raise ValueError('No matching deployed assets')
for directory in ['edge/shared','edge/reader','cloudflare/read-router']:
 for p in (root/directory).iterdir():
  if p.is_file():entries[p.relative_to(root).as_posix()]=p.read_bytes()
subprocess.run(['node','-e',"require('esbuild').buildSync({entryPoints:['cloudflare/read-router/worker.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'.cache/read-router-worker.mjs'})"],cwd=root,check=True)
entries['WORKER.mjs']=(root/'.cache/read-router-worker.mjs').read_bytes()
entries['REVISION']=(revision+'\n').encode();entries['FRONTEND_REVISION']=(release['revision']+'\n').encode()
entries['SHA256SUMS']=''.join(hashlib.sha256(b).hexdigest()+'  '+n+'\n' for n,b in sorted(entries.items())).encode()
out=root/'.cache'/('mooncci-reader-preview-'+revision[:12]+'.tar.gz')
with tarfile.open(out,'w:gz') as t:
 for name,b in sorted(entries.items()):
  item=tarfile.TarInfo(name);item.size=len(b);item.mode=0o644;t.addfile(item,io.BytesIO(b))
with tarfile.open(out) as t:
 assert set(t.getnames())==set(entries)
 for name,b in entries.items():assert t.extractfile(name).read()==b
for name,b in entries.items():
 if not name.startswith('dist/'):assert b'\r' not in b
sha=hashlib.sha256(out.read_bytes()).hexdigest();Path(str(out)+'.sha256').write_bytes((sha+'  '+out.name+'\n').encode())
result={'package':str(out),'sha256':sha,'revision':revision,'frontendRevision':release['revision'],'stage':'preview-only; no traffic change'}
(root/'.cache/reader-node-release.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(result,indent=2))
