#!/usr/bin/env bash
set -Eeuo pipefail
backup=$(realpath -e -- "${1:?Pass the deployment backup directory}")
case "$backup" in /www/backup/mooncci-article-images.*) ;; *) exit 1 ;; esac
if [ "${MOONCCI_DEPLOY_LOCK_HELD:-0}" != 1 ]; then
 exec 9>/www/backup/mooncci-deploy.lock
 flock -w 120 9
fi
api_id=$(cat "$backup/API_ID")
[[ "$api_id" =~ ^[0-9]+$ ]]
# Do not overwrite a later deployment with this rollback.
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
node - "$backup" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const states=JSON.parse(fs.readFileSync(path.join(process.argv[2],'ROLLBACK_STATE.json'),'utf8'));
for(const [name,state] of Object.entries(states)){
 const target=path.join('/www/wwwroot/mooncci-source/server',name);
 const current=fs.existsSync(target)?crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'):null;
 if(current!==state.before&&current!==state.after)throw Error('Later or unknown change; rollback stopped: '+name);
}
NODE
tar -xpf "$backup/backend-before.tar" -C /www/wwwroot/mooncci-source/server
while IFS= read -r file; do
 case "$file" in src/lib/articleImages.js) rm -- "/www/wwwroot/mooncci-source/server/$file" ;; *) exit 1 ;; esac
done < "$backup/ADDED_FILES"
su -s /bin/bash mooncci -c "export PATH=/opt/mooncci-node-v24.20.0/bin:\$PATH; pm2 restart $api_id"
for attempt in $(seq 1 15); do
 if curl -fsS --connect-timeout 2 --max-time 3 http://127.0.0.1:3001/api/health; then printf '\nPASS: previous article routes restored.\n'; exit 0; fi
 sleep 2
done
exit 1

