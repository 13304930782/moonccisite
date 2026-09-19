"""Scoped maintenance release; no SQL, dependency installation, or production mutation."""
import hashlib,io,json,subprocess,tarfile
from pathlib import Path
root=Path(__file__).resolve().parent.parent

def git(*args): return subprocess.check_output(['git','-c','safe.directory='+root.as_posix(),*args],cwd=root)
def sha(b):return hashlib.sha256(b).hexdigest()
if git('status','--porcelain').strip():raise RuntimeError('Commit validated changes before packaging')
revision=git('rev-parse','HEAD').decode().strip()
subprocess.run(['cmd','/c','npm','run','check'],cwd=root,check=True)
entries={};rows=[]
backend=['src/lib/runtimeStatus.js','src/routes/admin.js','src/worker.js']
for name in backend:
    data=(root/'server'/name).read_bytes();accepted=[None] if name=='src/lib/runtimeStatus.js' else []
    if accepted==[]:
        for ref in ['origin/main','b2affe0']:
            try:
                old=git('show',ref+':server/'+name);accepted.extend([sha(old),sha(old.replace(b'\r\n',b'\n'))])
            except subprocess.CalledProcessError:pass
    entries['payload/backend/'+name]=data
    rows.append({'kind':'backend','path':name,'sha256':sha(data),'accepted':list(dict.fromkeys(accepted))})
old_hashes={}
for archive in (root/'.cache').glob('mooncci-*.tar.gz'):
    try:
        with tarfile.open(archive) as t:
            for member in t.getmembers():
                if not member.isfile():continue
                prefix=next((v for v in ['dist/','payload/frontend/'] if member.name.startswith(v)),None)
                if prefix:old_hashes.setdefault(member.name[len(prefix):],set()).add(sha(t.extractfile(member).read()))
    except tarfile.TarError:pass
for file in sorted((root/'dist').rglob('*')):
    if file.is_symlink():raise ValueError('Symlink in dist')
    if not file.is_file():continue
    name=file.relative_to(root/'dist').as_posix();data=file.read_bytes()
    entries['payload/frontend/'+name]=data
    # Public nonhashed files may have previous deployed versions from known archives.
    accepted=[None,*sorted(old_hashes.get(name,set()))]
    rows.append({'kind':'frontend','path':name,'sha256':sha(data),'accepted':list(dict.fromkeys(accepted))})
manifest={'version':1,'revision':revision,'dependencies':[],'migrations':[],'requiredMigrations':['202609190001_article_revisions.sql','202609190002_article_bookmarks.sql'],'files':rows}
entries['MANIFEST.json']=(json.dumps(manifest,indent=2)+'\n').encode()
entries['deploy.py']=(root/'scripts/ops/deploy.py').read_bytes()
for p in (root/'scripts/ops').iterdir():
    if p.is_file():entries['ops/'+p.name]=p.read_bytes()
entries['SHA256SUMS']=''.join(sha(b)+'  '+n+'\n' for n,b in sorted(entries.items())).encode()
out=root/'.cache'/('mooncci-maintenance-'+revision[:12]+'.tar.gz')
with tarfile.open(out,'w:gz') as t:
    for name,b in sorted(entries.items()):
        item=tarfile.TarInfo(name);item.size=len(b);item.mode=0o644;t.addfile(item,io.BytesIO(b))
with tarfile.open(out) as t:
    assert set(t.getnames())==set(entries)
    for name,b in entries.items():assert t.extractfile(name).read()==b
for name,b in entries.items():
    if name.startswith('ops/') or name in ['deploy.py','MANIFEST.json','SHA256SUMS']:assert b'\r' not in b
checksum=sha(out.read_bytes());Path(str(out)+'.sha256').write_bytes((checksum+'  '+out.name+'\n').encode())
result={'revision':revision,'package':str(out),'sha256':checksum,'bytes':out.stat().st_size,'scope':'frontend + three backend files; no SQL/dependencies; ops templates not enabled'}
(root/'.cache/maintenance-release.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(result,indent=2))
