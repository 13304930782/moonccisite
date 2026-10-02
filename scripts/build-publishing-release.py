
"""Build an offline phase-one source snapshot; never claim an uncommitted tree is a clean revision."""
import hashlib,io,json,os,subprocess,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
BACKEND=['src/index.js','src/jobs/contentScheduler.js','src/lib/articlePublishing.js','src/services/articleWorkflow.js','src/routes/articleDrafts.js','src/routes/posts.js','src/routes/upload.js','src/routes/publishing.js','src/routes/series.js','database/migrations/202609210001_publishing.sql']
def git(*args):return subprocess.check_output(['git','-c','safe.directory='+str(ROOT),*args],cwd=ROOT,stderr=subprocess.DEVNULL)
def sha(data):return hashlib.sha256(data).hexdigest()
def normalized(file):return file.read_bytes().replace(b'\r\n',b'\n')
def source_snapshot():
 paths=[*ROOT.joinpath('src').rglob('*'),*ROOT.joinpath('public').rglob('*')]
 paths += [ROOT/'package.json',ROOT/'package-lock.json',ROOT/'vite.config.ts',ROOT/'index.html']
 paths += [ROOT/'server'/n for n in BACKEND]
 paths += [ROOT/'scripts'/n for n in ['deploy-publishing.sh','rollback-publishing.sh','publishing-env.py']]
 paths += [ROOT/'server/scripts/migrate-publishing.js']
 return {p.relative_to(ROOT).as_posix():sha(normalized(p)) for p in sorted(set(paths)) if p.is_file()}
def main():
 before=source_snapshot()
 subprocess.run(['npm.cmd' if os.name=='nt' else 'npm','run','build'],cwd=ROOT,check=True)
 subprocess.run(['npm.cmd' if os.name=='nt' else 'npm','run','check:bundle'],cwd=ROOT,check=True)
 if source_snapshot()!=before:raise SystemExit('Source changed during build; stopped.')
 entries={}
 for p in (ROOT/'dist').rglob('*'):
  if p.is_file():
   if p.is_symlink() or any(x.startswith('.') for x in p.relative_to(ROOT/'dist').parts):raise ValueError('Unsafe build file')
   entries[p.relative_to(ROOT).as_posix()]=p.read_bytes()
 baseline={}
 for name in BACKEND:
  entries['server/'+name]=normalized(ROOT/'server'/name)
  try:old=git('show','HEAD:server/'+name);baseline[name]=sha(old.replace(b'\r\n',b'\n'))
  except subprocess.CalledProcessError:baseline[name]=None
 for name,source in {'deploy.sh':'scripts/deploy-publishing.sh','rollback.sh':'scripts/rollback-publishing.sh','publishing-env.py':'scripts/publishing-env.py','server/scripts/migrate-publishing.js':'server/scripts/migrate-publishing.js'}.items():entries[name]=normalized(ROOT/source)
 entries['BACKEND_FILES']=''.join(n+'\n' for n in BACKEND).encode()
 entries['BASELINE.json']=(json.dumps(baseline,indent=2)+'\n').encode()
 entries['SOURCE_FILES.json']=(json.dumps(before,indent=2)+'\n').encode()
 metadata={'phase':1,'base_commit':git('rev-parse','HEAD').decode().strip(),'source_snapshot_sha256':sha(entries['SOURCE_FILES.json']),'source_state':'working-tree snapshot; unrelated infrastructure changes excluded','restarts':['mooncci-api','mooncci-worker'],'migration':'202609210001_publishing.sql','new_dependencies':False,'production_accepted':False}
 entries['MANIFEST.json']=(json.dumps(metadata,indent=2)+'\n').encode()
 entries['SHA256SUMS']=''.join(sha(b)+'  '+n+'\n' for n,b in sorted(entries.items())).encode()
 output=ROOT/'outputs/mooncci-publishing-phase1.tar.gz';output.parent.mkdir(exist_ok=True)
 with tarfile.open(output,'w:gz') as archive:
  for name,data in sorted(entries.items()):
   info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o755 if name.endswith('.sh') else 0o644;archive.addfile(info,io.BytesIO(data))
 with tarfile.open(output) as archive:
  assert set(archive.getnames())==set(entries)
  for name,data in entries.items():
   assert archive.extractfile(name).read()==data
   if name.endswith(('.sh','.py','.sql','.json','.js')) or name in ['BACKEND_FILES','SHA256SUMS']:assert b'\r' not in data,name
 digest=sha(output.read_bytes());Path(str(output)+'.sha256').write_bytes((digest+'  '+output.name+'\n').encode())
 (ROOT/'.cache/publishing-release.json').write_bytes((json.dumps({**metadata,'package':str(output),'sha256':digest,'bytes':output.stat().st_size},indent=2)+'\n').encode())
 print(json.dumps({'package':str(output),'sha256':digest,'bytes':output.stat().st_size},indent=2))
if __name__=='__main__':main()
