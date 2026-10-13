"""Explicitly scoped backend + SSR + frontend offline release, verified byte by byte."""
import hashlib, io, json, os, subprocess, tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
BACKEND=['src/index.js','src/lib/articlePublishing.js','src/lib/articleRevisions.js','src/lib/articleSummaryProof.js','src/lib/seo.js','src/routes/articleDrafts.js','src/routes/posts.js','src/routes/articleSeo.js','src/services/articleWorkflow.js','src/services/articleSummary.js']
PREREQUISITES=['src/routes/seo.js','src/routes/nodeMonitor.js']
def sha(data):return hashlib.sha256(data).hexdigest()
def norm(p):return p.read_bytes().replace(b'\r\n',b'\n')
def git(*args):return subprocess.check_output(['git','-c','safe.directory='+str(ROOT),*args],cwd=ROOT).decode().strip()
def main():
 if git('status','--porcelain'):raise SystemExit('Commit source before packaging.')
 revision=git('rev-parse','HEAD')
 sources={p.relative_to(ROOT).as_posix():sha(norm(p)) for folder in ['src','public','server/render'] for p in (ROOT/folder).rglob('*') if p.is_file()}
 sources.update({'server/'+name:sha(norm(ROOT/'server'/name)) for name in BACKEND})
 entries={p.relative_to(ROOT).as_posix():p.read_bytes() for directory in ['dist','server/runtime'] for p in (ROOT/directory).rglob('*') if p.is_file()}
 assert entries.get('dist/index.html') and entries.get('server/runtime/document.mjs')
 for name in BACKEND:entries['server/'+name]=norm(ROOT/'server'/name)
 for name in ['deploy','rollback']:entries[name+'.sh']=norm(ROOT/'scripts'/(name+'-article-summary.sh'))
 baseline={'backend':{name:sha(norm(ROOT/'.cache/prod-before'/name)) if (ROOT/'.cache/prod-before'/name).exists() else None for name in BACKEND},'prerequisites':{name:sha(norm(ROOT/'.cache/prod-before'/name)) for name in PREREQUISITES},'entries':json.loads((ROOT/'.cache/live-entry-baseline.json').read_text())}
 entries['BASELINE.json']=(json.dumps(baseline,indent=2)+'\n').encode()
 entries['BACKEND_FILES']=('\n'.join(BACKEND)+'\n').encode()
 entries['SOURCE_FILES.json']=(json.dumps(sources,indent=2)+'\n').encode()
 entries['MANIFEST.json']=(json.dumps({'revision':revision,'backend_files':BACKEND,'frontend':True,'ssr_runtime':True,'restarts':['mooncci-api','mooncci-worker'],'migrations':[],'dependencies_changed':False,'env_changes':False,'source_sha256':sha(entries['SOURCE_FILES.json'])},indent=2)+'\n').encode()
 entries['SHA256SUMS']=''.join(sha(data)+'  '+name+'\n' for name,data in sorted(entries.items())).encode()
 output=ROOT/'.cache/mooncci-article-summary.tar.gz'
 with tarfile.open(output,'w:gz') as archive:
  for name,data in sorted(entries.items()):
   assert not name.startswith('/') and '..' not in Path(name).parts
   info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o755 if name.endswith('.sh') else 0o644;archive.addfile(info,io.BytesIO(data))
 with tarfile.open(output) as archive:
  assert set(archive.getnames())==set(entries)
  for name,data in entries.items():
   assert archive.extractfile(name).read()==data
   if name.endswith('.sh') or name in ['SHA256SUMS','BACKEND_FILES','BASELINE.json','MANIFEST.json','SOURCE_FILES.json']:assert b'\r' not in data,name
  for line in archive.extractfile('SHA256SUMS').read().decode().splitlines():
   expected,name=line.split('  ',1);assert sha(archive.extractfile(name).read())==expected
 digest=sha(output.read_bytes());Path(str(output)+'.sha256').write_bytes((digest+'  '+output.name+'\n').encode())
 assert Path(str(output)+'.sha256').read_bytes().endswith(b'\n') and b'\r' not in Path(str(output)+'.sha256').read_bytes()
 if git('status','--porcelain') or git('rev-parse','HEAD')!=revision:raise SystemExit('Source changed during packaging.')
 result={'archive':str(output),'sha256':digest,'bytes':output.stat().st_size,'revision':revision,'files':len(entries)}
 (ROOT/'.cache/summary-release.json').write_bytes((json.dumps(result,indent=2)+'\n').encode());print(json.dumps(result,indent=2))
if __name__=='__main__':main()
