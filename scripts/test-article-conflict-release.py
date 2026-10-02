import hashlib,json,tarfile
from pathlib import Path
p=Path('outputs/mooncci-article-conflict.tar.gz');side=Path(str(p)+'.sha256').read_bytes();assert b'\r' not in side;assert side.decode().split()[0]==hashlib.sha256(p.read_bytes()).hexdigest()
with tarfile.open(p) as t:
 entries={m.name:t.extractfile(m).read() for m in t.getmembers() if m.isfile()}
 assert len(entries)==len(t.getmembers())
for line in entries['SHA256SUMS'].decode().splitlines():
 digest,name=line.split('  ',1);assert hashlib.sha256(entries[name]).hexdigest()==digest,name
assert {n for n in entries if n.startswith('server/')}=={'server/src/lib/articleConflict.js','server/src/routes/articleDrafts.js'}
for n,b in entries.items():
 assert not n.startswith('/') and '..' not in Path(n).parts
 assert not {'.env','uploads','node_modules'}&set(Path(n).parts)
 if not n.startswith('dist/'):assert b'\r' not in b,n
for n in ['src/lib/articlePublishing.js','src/lib/articleRevisions.js','src/services/articleWorkflow.js']:
 assert json.loads(entries['PREREQUISITES.json'])[n]==hashlib.sha256(Path('server',n).read_bytes().replace(b'\r\n',b'\n')).hexdigest()
print('PASS: archive scope, every member checksum, LF, dependency fingerprints, no migration/environment/uploads.')
