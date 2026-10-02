"""Timeline list and reading-first update detail release; excludes unaccepted startup recovery."""
import hashlib, io, json, os, shutil, subprocess, tarfile, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
BACKEND=['src/lib/contentPlatform.js','src/services/githubSync.js','src/routes/contentPlatform.js','src/repositories/activityRepository.js','scripts/migrate-github-prereleases.js','database/migrations/202609240001_github_prereleases.sql']
def sha(data): return hashlib.sha256(data).hexdigest()
def norm(path): return path.read_bytes().replace(b'\r\n',b'\n')
def git(*args): return subprocess.check_output(['git','-c','safe.directory='+str(ROOT),*args],cwd=ROOT)
def main():
 stage=Path(tempfile.mkdtemp(prefix='journal-build-',dir=ROOT/'.cache'))
 for directory in ['src','public']:
  shutil.copytree(ROOT/directory,stage/directory)
 for name in ['package.json','package-lock.json','vite.config.ts','tsconfig.json','postcss.config.mjs','bundle-budget.json']:
  shutil.copy2(ROOT/name,stage/name)
 for name in ['editor-sanitizer.mjs','check-bundle-budget.mjs']:
  (stage/'scripts').mkdir(exist_ok=True);shutil.copy2(ROOT/'scripts'/name,stage/'scripts'/name)
 for name in ['loginDestinationRules.json']:
  (stage/'server/src/lib').mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/'server/src/lib'/name,stage/'server/src/lib'/name)
 for name in ['index.html','src/main.tsx']:
  (stage/name).write_bytes(git('show','HEAD:'+name).replace(b'\r\n',b'\n'))
 (stage/'src/app/components/AppErrorBoundary.tsx').unlink(missing_ok=True)
 # A junction reuses installed tooling without downloading or changing dependencies.
 subprocess.run(['powershell','-NoProfile','-Command',"New-Item -ItemType Junction -Path '"+str(stage/'node_modules')+"' -Target '"+str(ROOT/'node_modules')+"' | Out-Null"],check=True)
 sources={p.relative_to(stage).as_posix():sha(norm(p)) for directory in ['src','public','server','scripts'] for p in (stage/directory).rglob('*') if p.is_file()}
 for name in ['index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json','postcss.config.mjs','bundle-budget.json']:sources[name]=sha(norm(stage/name))
 subprocess.run(['npm.cmd','run','typecheck'],cwd=stage,check=True)
 subprocess.run(['npm.cmd','run','build'],cwd=stage,check=True)
 subprocess.run(['npm.cmd','run','check:bundle'],cwd=stage,check=True)
 entries={p.relative_to(stage).as_posix():p.read_bytes() for p in (stage/'dist').rglob('*') if p.is_file()}
 assert b'startup-shell' not in entries['dist/index.html']
 baseline={}
 for name in BACKEND:
  entries['server/'+name]=norm(ROOT/'server'/name)
  baseline[name]=json.loads((ROOT/'.cache/prerelease-baseline.json').read_text()).get(name)
 for name in ['deploy','rollback']:entries[name+'.sh']=norm(ROOT/'scripts'/(name+'-github-prereleases.sh'))
 entries['BACKEND_FILES']=('\n'.join(BACKEND)+'\n').encode()
 entries['BASELINE.json']=(json.dumps(baseline,indent=2)+'\n').encode()
 entries['SOURCE_FILES.json']=(json.dumps(sources,indent=2)+'\n').encode()
 metadata={'release':'github-prereleases','frontend':'current working snapshot excluding unaccepted startup recovery','source_sha256':sha(entries['SOURCE_FILES.json']),'backend_files':BACKEND,'restarts':['mooncci-api','mooncci-worker'],'migrations':['202609240001_github_prereleases.sql'],'dependencies_changed':False,'worker_restart':True,'production_accepted':False}
 entries['MANIFEST.json']=(json.dumps(metadata,indent=2)+'\n').encode()
 entries['SHA256SUMS']=''.join(sha(data)+'  '+name+'\n' for name,data in sorted(entries.items())).encode()
 output=ROOT/'outputs/mooncci-github-prereleases.tar.gz'
 with tarfile.open(output,'w:gz') as archive:
  for name,data in sorted(entries.items()):
   info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o755 if name.endswith('.sh') else 0o644;archive.addfile(info,io.BytesIO(data))
 with tarfile.open(output) as archive:
  assert set(archive.getnames())==set(entries)
  for name,data in entries.items():
   assert archive.extractfile(name).read()==data
   if not name.startswith('dist/'):assert b'\r' not in data,name
 digest=sha(output.read_bytes());Path(str(output)+'.sha256').write_bytes((digest+'  '+output.name+'\n').encode())
 print(json.dumps({'archive':str(output),'sha256':digest,'stage':str(stage)},indent=2))
if __name__=='__main__':main()
