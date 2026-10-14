#!/usr/bin/env bash
# Execute with nohup bash deploy.sh in a child shell. Never source this file.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then printf 'Run this script in a child shell.\n' >&2; return 2; fi
set -Eeuo pipefail
umask 077
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
cd "$package"
command -v python3 >/dev/null
mode=$(python3 -c 'import json; print(json.load(open("MANIFEST.json"))["target"])')
live=/www/wwwroot/mooncci-source/server
case "$mode" in
 main) web=/www/wwwroot/mooncci.site; node=/opt/mooncci-node-v24.20.0/bin/node; export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH" ;;
 reader) web=$(readlink -f /opt/mooncci-reader/current/dist)
   case "$web" in /opt/mooncci-reader/releases/*/dist) ;; *) printf 'Reader current escapes releases.\n' >&2; exit 2 ;; esac
   node=$(python3 -c 'import json; print(json.load(open("BASELINE.json"))["reader"]["node"])')
   case "$node" in /usr/bin/node|/opt/mooncci-node-v24.20.0/bin/node) ;; *) printf 'Unexpected inspected reader Node.\n' >&2; exit 2 ;; esac ;;
 *) printf 'Unexpected release target.\n' >&2; exit 2 ;;
esac
test -x "$node"
"$node" verify.cjs package "$package"
for tool in flock tar rsync sha256sum; do command -v "$tool" >/dev/null; done
mkdir -p /www/backup
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
backup=$(mktemp -d "/www/backup/mooncci-cover-focus-$mode.XXXXXX")
changed=0
runtime_stage=''
pm() { su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 $*"; }
finish() {
 rc=$?; trap - EXIT; set +e
 if [ "$rc" -ne 0 ] && [ "$changed" = 1 ]; then
   MOONCCI_DEPLOY_LOCK_HELD=1 bash "$backup/rollback.sh" "$backup" >> "$backup/rollback.log" 2>&1
   rollback_rc=$?
   printf '%s\n' "$rollback_rc" > "$backup/rollback-exit-code"
   if [ "$rollback_rc" -ne 0 ]; then printf 'ROLLBACK NEEDS ATTENTION: %s\n' "$backup"; fi
 fi
 # Leave staged/failed runtime paths in the log for diagnosis; no recursive deletion.
 if [ -n "$runtime_stage" ]; then printf 'STAGED_RUNTIME=%s\n' "$runtime_stage"; fi
 printf '%s\n' "$rc" > "$backup/exit-code"
 printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
 exit "$rc"
}
trap finish EXIT
"$node" verify.cjs baseline "$package" "$live" "$web"
if [ "$mode" = main ]; then
 test -s "$live/.env"
 test -d "$live/node_modules"
 test "$(stat -c %d "$live/runtime")" = "$(stat -c %d "$backup")"
 test "$($node -p 'process.versions.node')" = 24.20.0
 command -v su >/dev/null
 pm jlist | "$node" verify.cjs pm2 "$package" "$backup/pm2-before.json"
fi
"$node" verify.cjs snapshot "$package" "$live" "$web" "$backup"
cp -p rollback.sh "$backup/rollback.sh"
cp -p verify.cjs "$backup/verify.cjs"
printf '%s\n' "$node" > "$backup/NODE"
tar -cpf "$backup/frontend-before.tar" -C "$web" -T "$backup/EXISTING_WEB"
if [ "$mode" = main ]; then
 tar -cpf "$backup/source-before.tar" -C "$(dirname "$live")" -T "$backup/EXISTING_SOURCE"
 tar -cpf "$backup/runtime-before.tar" -C "$live/runtime" -T "$backup/RUNTIME_FILES"
 runtime_stage=$(mktemp -d "$live/.runtime-cover-focus.XXXXXX")
 rsync -ac server/runtime/ "$runtime_stage/"
 chown -R mooncci:mooncci "$runtime_stage"
 chmod -R u=rwX,go=rX "$runtime_stage"
 "$node" verify.cjs stage "$package" "$live" "$runtime_stage"
fi
# Verify the actual tar bytes against the complete captured file snapshot.
python3 - "$backup" <<'PY'
import hashlib,json,sys,tarfile
from pathlib import Path
root=Path(sys.argv[1]); before=json.loads((root/'BEFORE.json').read_text())
scopes=[('frontend-before.tar','frontend')]
if before['target']=='main': scopes += [('source-before.tar','source'),('runtime-before.tar','runtime')]
for archive_name,scope in scopes:
 expected={name:sha for name,sha in before[scope].items() if sha is not None}
 with tarfile.open(root/archive_name) as archive:
  members=archive.getmembers()
  if len(members)!=len(expected) or {member.name for member in members}!=set(expected): raise SystemExit('Backup tar file set mismatch: '+scope)
  for member in members:
   if not member.isfile() or member.issym() or member.islnk(): raise SystemExit('Nonregular backup entry')
   if hashlib.sha256(archive.extractfile(member).read()).hexdigest()!=expected[member.name]: raise SystemExit('Backup tar byte mismatch: '+member.name)
print('PASS: complete backup tar file lists and captured bytes')
PY
(
 cd "$backup"
 files=(BEFORE.json EXPECTED.json BASELINE.json MANIFEST.json EXISTING_WEB NEW_WEB EXISTING_SOURCE NEW_SOURCE RUNTIME_FILES NEW_RUNTIME NODE rollback.sh verify.cjs frontend-before.tar)
 if [ "$mode" = main ]; then files+=(source-before.tar runtime-before.tar pm2-before.json); fi
 sha256sum -- "${files[@]}" > BACKUP_SHA256SUMS
 sha256sum --strict -c BACKUP_SHA256SUMS >/dev/null
)
# Reject drift a second time immediately before the first live mutation.
"$node" verify.cjs baseline "$package" "$live" "$web"
"$node" verify.cjs snapshot-unchanged "$backup"
if [ "$mode" = main ]; then
 pm jlist | "$node" verify.cjs pm2 "$package"
fi
# Reject drift again after staging, before live installation.
"$node" verify.cjs baseline "$package" "$live" "$web"
"$node" verify.cjs snapshot-unchanged "$backup"
changed=1
# Keep old hashed assets for open pages. Every overwritten existing file is backed up.
rsync -ac --exclude=index.html dist/ "$web/"
if [ "$mode" = main ]; then
 while IFS= read -r file; do
   dest="$(dirname "$live")/$file"
   mkdir -p -- "$(dirname "$dest")"
   install -o mooncci -g mooncci -m 644 "source/$file" "$dest.cover-focus-new"
   mv -f -- "$dest.cover-focus-new" "$dest"
 done < SOURCE_FILES
 # Preserve this directory and the live worker/deployment state writer inode.
 # Transfer temporary files outside runtime; interrupted rsync cannot introduce
 # unknown temporary code paths into the rollback-protected managed tree.
 mkdir "$backup/runtime-incoming"
 rsync -ac --temp-dir="$backup/runtime-incoming" --exclude=/document.mjs --exclude=/styles.json --exclude=/home.css "$runtime_stage/" "$live/runtime/"
 for entry in document.mjs styles.json home.css; do
   install -o mooncci -g mooncci -m 644 "$runtime_stage/$entry" "$backup/runtime-incoming/$entry"
   mv -f -- "$backup/runtime-incoming/$entry" "$live/runtime/$entry"
 done
fi
install -m 644 dist/index.html "$web/.index-cover-focus-new"
mv -f -- "$web/.index-cover-focus-new" "$web/index.html"
"$node" verify.cjs installed "$package" "$live" "$web" > "$backup/installed.log"
"$node" verify.cjs rollback-guard "$backup"
if [ "$mode" = main ]; then
 pm reload mooncci-api
 ready=0
 for attempt in $(seq 1 30); do
   if "$node" -e 'fetch("http://127.0.0.1:3001/api/health",{signal:AbortSignal.timeout(3000)}).then(async r=>{if(!r.ok||(await r.json()).ok!==true)process.exit(1)}).catch(()=>process.exit(1))'; then ready=1; break; fi
   sleep 2
 done
 test "$ready" = 1
 pm jlist | "$node" verify.cjs pm2 "$package" "$backup/pm2-after.json"
 "$node" verify.cjs stage "$package" "$live" "$live/runtime" > "$backup/live-crop-ssr-proof.log"
fi
"$node" verify.cjs public "$package" "$live" "$web" "$backup" > "$backup/acceptance.log"
printf 'PASS: cover-focus %s release; scoped offline files verified; configuration and original covers preserved.\n' "$mode"
