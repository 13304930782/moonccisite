"""Public frontend assets only; preserve the reader's service/configuration."""
import hashlib,io,json,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
def sha(data):return hashlib.sha256(data).hexdigest()
entries={p.relative_to(ROOT).as_posix():p.read_bytes() for p in (ROOT/'dist').rglob('*') if p.is_file()}
entries['deploy.sh']=b'''#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "$0")"
sha256sum --strict -c SHA256SUMS
target=$(readlink -f /opt/mooncci-reader/current/dist)
case "$target" in /opt/mooncci-reader/releases/*/dist) ;; *) echo 'Unexpected reader path'; exit 1 ;; esac
test -s "$target/index.html"
backup=$(mktemp -d /www/backup/mooncci-summary-reader-assets.XXXXXX)
cp -p "$target/index.html" "$backup/index.html"
# Old chunks remain available. Frontend-only: no PM2 or service restart.
rsync -ac --exclude=index.html dist/ "$target/"
install -m 644 dist/index.html "$target/.index-summary-new"
mv -f "$target/.index-summary-new" "$target/index.html"
sed -n 's|  dist/|  |p' SHA256SUMS > "$backup/checksums"
(cd "$target" && sha256sum --strict -c "$backup/checksums") > "$backup/verification.log"
printf 'PASS: reader assets synchronized, no configuration or process changes. BACKUP=%s\\n' "$backup"
'''
entries['MANIFEST.json']=(json.dumps({'scope':'reader frontend assets only','backend':False,'migrations':[],'restarts':[],'configuration_changes':False},indent=2)+'\n').encode()
entries['SHA256SUMS']=''.join(sha(data)+'  '+name+'\n' for name,data in sorted(entries.items())).encode()
out=ROOT/'.cache/mooncci-summary-reader-assets.tar.gz'
with tarfile.open(out,'w:gz') as archive:
 for name,data in sorted(entries.items()):
  info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o755 if name.endswith('.sh') else 0o644;archive.addfile(info,io.BytesIO(data))
with tarfile.open(out) as archive:
 assert set(archive.getnames())==set(entries)
 for name,data in entries.items():assert archive.extractfile(name).read()==data
 for name in ['deploy.sh','MANIFEST.json','SHA256SUMS']:assert b'\r' not in entries[name]
 for line in archive.extractfile('SHA256SUMS').read().decode().splitlines():
  expected,name=line.split('  ',1);assert sha(archive.extractfile(name).read())==expected
digest=sha(out.read_bytes());Path(str(out)+'.sha256').write_bytes((digest+'  '+out.name+'\n').encode())
print(json.dumps({'archive':str(out),'sha256':digest,'bytes':out.stat().st_size},indent=2))
