
"""Package the tested frontend build only; no database migration or process restart."""
import hashlib,io,json,subprocess,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
def sha(data):return hashlib.sha256(data).hexdigest()
def main():
 source={p.relative_to(ROOT).as_posix():sha(p.read_bytes().replace(b'\r\n',b'\n')) for p in sorted((ROOT/'src').rglob('*')) if p.is_file()}
 index=ROOT/'dist/index.html'
 if any(p.stat().st_mtime>index.stat().st_mtime for p in (ROOT/'src').rglob('*') if p.is_file()):raise SystemExit('Build frontend before packaging.')
 entries={p.relative_to(ROOT).as_posix():p.read_bytes() for p in (ROOT/'dist').rglob('*') if p.is_file()}
 source_id=sha(json.dumps(source,sort_keys=True).encode())[:40]
 entries['SOURCE_ID']=(source_id+'\n').encode()
 entries['MANIFEST.json']=(json.dumps({'scope':'frontend-only account layout, manuscript details and submission success dialog','source_state':'tested working-tree snapshot','source_id':source_id,'source_files':source,'migrations':[],'restarts':[],'production_accepted':False},indent=2)+'\n').encode()
 deploy=(ROOT/'scripts/deploy-offline-frontend.sh').read_text(encoding='utf-8').replace('cat REVISION','cat SOURCE_ID').replace('deployed-commit.txt','deployed-source.txt').replace('前端部署完成：','前端部署完成，源码快照：')
 entries['deploy.sh']=deploy.encode()
 entries['SHA256SUMS']=''.join(sha(b)+'  '+n+'\n' for n,b in sorted(entries.items())).encode()
 output=ROOT/'outputs/mooncci-account-workspace.tar.gz'
 with tarfile.open(output,'w:gz') as archive:
  for name,data in sorted(entries.items()):
   info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o755 if name.endswith('.sh') else 0o644;archive.addfile(info,io.BytesIO(data))
 with tarfile.open(output) as archive:
  assert set(archive.getnames())==set(entries)
  for name,data in entries.items():
   assert archive.extractfile(name).read()==data
   assert name.startswith('dist/') or name in ['SOURCE_ID','MANIFEST.json','deploy.sh','SHA256SUMS']
   if name.endswith(('.sh','.json','.js')) or name in ['SHA256SUMS','SOURCE_ID']:assert b'\r' not in data
 assert all(word not in deploy for word in ['pm2','migrate','node_modules'])
 digest=sha(output.read_bytes())
 Path(str(output)+'.sha256').write_bytes((digest+'  '+output.name+'\n').encode())
 print(json.dumps({'package':str(output),'bytes':output.stat().st_size,'sha256':digest},indent=2))
if __name__=='__main__':main()
