param([string]$Server = 'root@107.174.123.42')
$ErrorActionPreference = 'Stop'
$probe = @"
set -u
printf '\n--- Operating system ---\n'
cat /etc/os-release
printf '\n--- Node locations ---\n'
command -v node || true
node --version 2>/dev/null || true
find /www/server/nodejs /opt -maxdepth 4 -type f -name node -print 2>/dev/null | head -n 15
printf '\n--- Listening ports ---\n'
ss -lnt | head -n 35
printf '\n--- BaoTa public virtual hosts ---\n'
grep -hE '^[[:space:]]*(server_name|listen)[[:space:]]' /www/server/panel/vhost/nginx/*.conf 2>/dev/null || true
printf '\n--- Free disk and memory ---\n'
df -h / /www 2>/dev/null
free -m
"@
$probe | & ssh -o ConnectTimeout=15 $Server "tr -d '\r' | bash"
if ($LASTEXITCODE -ne 0) { throw 'Read-only probe failed; no deployment was attempted.' }
