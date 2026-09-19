#!/usr/bin/env bash
# Separate, explicit Nginx activation. Run with nohup bash, never source.
set -Eeuo pipefail
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
export PATH="/opt/mooncci-node-v24.20.0/bin:$PATH"
conf=$(readlink -f "${1:-/www/server/panel/vhost/nginx/mooncci.site.conf}")
case "$conf" in /www/server/panel/vhost/nginx/*.conf) ;; *) echo 'Unexpected vhost path'; exit 1;; esac
test -f "$conf"
nginx=/www/server/nginx/sbin/nginx
test -x "$nginx"
cd "$package"
sha256sum --strict -c SHA256SUMS >/dev/null
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
backup=$(mktemp -d /www/backup/mooncci-blog-seo.XXXXXX)
chmod 700 "$backup"
snippet=/www/server/panel/vhost/nginx/mooncci-blog-seo.inc
cp -p "$conf" "$backup/vhost.conf"
if [ -f "$snippet" ];then cp -p "$snippet" "$backup/previous.inc";fi
changed=0
finish(){
 rc=$?;trap - EXIT;set +e
 if [ "$rc" -ne 0 ] && [ "$changed" = 1 ];then
  cp -p "$backup/vhost.conf" "$conf"
  if [ -f "$backup/previous.inc" ];then cp -p "$backup/previous.inc" "$snippet";else rm -f -- "$snippet";fi
  "$nginx" -t && "$nginx" -s reload
 fi
 echo "Nginx backup: $backup"
 echo "SEO activation exit code: $rc"
 exit "$rc"
}
trap finish EXIT
node - "$conf" "$backup/candidate.conf" "$snippet" <<'NODE'
const fs=require('fs');const [file,out,snippet]=process.argv.slice(2);let s=fs.readFileSync(file,'utf8');
const include=`include ${snippet};`;
if(s.includes(include)){fs.writeFileSync(out,s);process.exit(0);}
// Strip comments and strings only for brace matching, preserving offsets.
let clean='',quote='',comment=false,escaped=false;
for(const c of s){if(comment){if(c==='\n'){comment=false;clean+='\n';}else clean+=' ';continue;}if(quote){clean+=' ';if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c===quote)quote='';continue;}if(c==='#'){comment=true;clean+=' ';}else if(c==='"'||c==="'"){quote=c;clean+=' ';}else clean+=c;}
const candidates=[];for(const match of clean.matchAll(/\bserver\s*\{/g)){let depth=1,i=match.index+match[0].length;const start=i;for(;i<clean.length&&depth;i++){if(clean[i]==='{')depth++;if(clean[i]==='}')depth--;}if(depth)throw Error('Unbalanced Nginx config');const body=s.slice(start,i-1);if(/server_name\s+[^;]*\bmooncci\.site\b[^;]*;/.test(body)&&/listen\s+[^;]*443[^;]*;/.test(body))candidates.push(start);}
if(candidates.length!==1)throw Error('Expected exactly one HTTPS server block for mooncci.site; configure include manually.');
const at=candidates[0];s=s.slice(0,at)+'\n    '+include+'\n'+s.slice(at);fs.writeFileSync(out,s);
NODE
# The rollback command restores this exact saved configuration in a child shell.
printf '%s\n' '#!/usr/bin/env bash' 'set -eu' > "$backup/rollback.sh"
printf 'cp -p %q %q\n' "$backup/vhost.conf" "$conf" >> "$backup/rollback.sh"
if [ -f "$backup/previous.inc" ];then printf 'cp -p %q %q\n' "$backup/previous.inc" "$snippet" >> "$backup/rollback.sh";else printf 'rm -f -- %q\n' "$snippet" >> "$backup/rollback.sh";fi
printf '%q -t && %q -s reload\n' "$nginx" "$nginx" >> "$backup/rollback.sh"
changed=1
install -m 644 nginx-blog-seo.conf "$snippet"
cat "$backup/candidate.conf" > "$conf"
"$nginx" -t
"$nginx" -s reload
echo 'SEO routes enabled. Run verify-blog-seo.mjs against https://mooncci.site.'
printf 'Rollback: nohup bash %q > %q 2>&1 < /dev/null &\n' "$backup/rollback.sh" "$backup/rollback.log"
