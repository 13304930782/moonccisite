"""Build separate, allowlisted revision/bookmark releases; never bundle historical SQL."""
import hashlib,io,json,subprocess,sys,tarfile
from pathlib import Path
root=Path(__file__).resolve().parent.parent
stage=sys.argv[1] if len(sys.argv)>1 else 'revisions'
scopes={
'revisions':['src/routes/articleDrafts.js','src/routes/posts.js','src/routes/upload.js','src/jobs/contentScheduler.js','src/lib/articleRevisions.js'],
'bookmarks':['src/index.js','src/routes/account.js','src/routes/bookmarks.js','src/lib/socialConfig.js'],
}
if stage not in scopes:raise ValueError('Invalid stage')
subprocess.run([sys.executable,str(root/'scripts/build-offline-release.py')],check=True)
release=json.loads((root/'.cache/offline-release.json').read_text())
with tarfile.open(release['package']) as a:entries={m.name:a.extractfile(m).read() for m in a.getmembers()}
files=scopes[stage]
known=json.loads((root/f'scripts/{stage}-baseline.json').read_text())
baseline={n:known.get(n,[None])[:] for n in files}
for n in files:
 data=(root/'server'/n).read_text(encoding='utf-8-sig').encode();entries['server/'+n]=data;baseline[n].append(hashlib.sha256(data).hexdigest())
filename={'revisions':'202609190001_article_revisions.sql','bookmarks':'202609190002_article_bookmarks.sql'}[stage]
for n in ['scripts/migrate-reader-features.js','database/migrations/'+filename]:entries['server/'+n]=(root/'server'/n).read_text(encoding='utf-8-sig').encode()
entries['deploy.sh']=(root/'scripts/deploy-reader-features.sh').read_text(encoding='utf-8-sig').encode()
entries['STAGE']=(stage+'\n').encode();entries['BASELINE.json']=(json.dumps(baseline,indent=2)+'\n').encode();entries['BACKEND_FILES']=(''.join(n+'\n' for n in files)).encode()
entries.pop('SHA256SUMS');entries['SHA256SUMS']=''.join(hashlib.sha256(b).hexdigest()+'  '+n+'\n' for n,b in sorted(entries.items())).encode()
if subprocess.check_output(['git','status','--porcelain'],cwd=root).strip():raise RuntimeError('Worktree changed')
out=root/'.cache'/f"mooncci-{stage}-{release['revision'][:12]}.tar.gz"
with tarfile.open(out,'w:gz') as a:
 for n,b in sorted(entries.items()):
  i=tarfile.TarInfo(n);i.size=len(b);i.mode=0o755 if n.endswith('.sh') else 0o644;a.addfile(i,io.BytesIO(b))
with tarfile.open(out) as a:
 for n,b in entries.items():
  assert a.extractfile(n).read()==b
  if n.endswith(('.sh','.sql')) or n in ['REVISION','STAGE','SHA256SUMS','BACKEND_FILES','BASELINE.json']:assert b'\r' not in b
sha=hashlib.sha256(out.read_bytes()).hexdigest();Path(str(out)+'.sha256').write_bytes((sha+'  '+out.name+'\n').encode())
result={**release,'package':str(out),'bytes':out.stat().st_size,'sha256':sha,'scope':stage+'-with-additive-migration'}
(root/f'.cache/{stage}-release.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(result,indent=2))
