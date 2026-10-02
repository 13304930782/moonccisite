"""Read-only, filtered origin proxy inspection. Never print environment secrets."""
from pathlib import Path
import re
import socket
import subprocess
print('HOST',socket.gethostname())
p=subprocess.run(['/www/server/nginx/sbin/nginx','-T'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True)
print('NGINX_CONFIG_EXIT',p.returncode)
if p.returncode:
    print('STOP: nginx -T failed; full diagnostics withheld');raise SystemExit(1)
source=''
for line in p.stdout.splitlines():
    if line.startswith('# configuration file '):source=line
    text=line.strip()
    relevant=('mooncci.site' in source or source.endswith('/nginx.conf:'))
    if re.match(r'^(set_real_ip_from|real_ip_header|real_ip_recursive)\s',text) or (relevant and re.match(r'^(server_name|listen|proxy_set_header\s+(X-Forwarded-For|X-Real-IP|Host|X-Forwarded-Proto))\s',text)):
        print(source);print(text)
f=Path('/www/wwwroot/mooncci-source/server/.env')
if f.is_file():
    lines=[x for x in f.read_text().splitlines() if re.match(r'^\s*TRUST_PROXY\s*=',x)]
    print('ENV_FILE_TRUST_PROXY',lines[-1] if lines else 'not set (code default loopback; runtime must also be checked)')
# Read only the named setting from live backend process environments; never print other variables.
for d in Path('/proc').iterdir():
    if not d.name.isdigit():continue
    try:
        cmd=(d/'cmdline').read_bytes().replace(b'\0',b' ')
        if b'mooncci' not in cmd or b'node' not in cmd:continue
        rows=(d/'environ').read_bytes().split(b'\0')
        values=[x.decode('utf-8','replace') for x in rows if x.startswith(b'TRUST_PROXY=')]
        print('PROCESS',d.name,'TRUST_PROXY',values or ['not set'])
    except (OSError,PermissionError):pass
