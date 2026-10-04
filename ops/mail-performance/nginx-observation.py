#!/usr/bin/env python3
"""Scoped CN/US mailbox timing logs. No body, query string, IP, cookie or auth headers.
Run install CN|US or rollback BACKUP. Existing vhost bytes are backed up and hash guarded.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

BASE = Path('/www/server/panel/vhost/nginx')
SITE = BASE / 'mooncci.site.conf'
EXTRA = BASE / '00-mooncci-mail-timing.conf'
NGINX = '/www/server/nginx/sbin/nginx'


def digest(data):
    return hashlib.sha256(data).hexdigest() if data is not None else None


def atomic(path, data):
    temp = path.with_name(path.name + '.mail-observe-tmp')
    temp.write_bytes(data)
    os.chmod(str(temp), 0o600)
    os.replace(str(temp), str(path))


def config(entry):
    return r'''map $uri $mooncci_mail_route {
    default "";
    /api/mailboxes/me /api/mailboxes/me;
    /api/mailboxes/sent /api/mailboxes/sent;
    /api/mailboxes/send /api/mailboxes/send;
    /api/mailboxes/folders/inbox /api/mailboxes/folders/inbox;
    /api/mailboxes/folders/sent /api/mailboxes/folders/sent;
    ~^/api/mailboxes/folders/inbox/[0-9]+/?$ /api/mailboxes/folders/inbox/:uid;
    ~^/api/mailboxes/folders/sent/[0-9]+/?$ /api/mailboxes/folders/sent/:uid;
}
map $mooncci_mail_route $mooncci_mail_loggable { "" 0; default 1; }
map $upstream_http_x_mail_request_id $mooncci_mail_id {
    default "-";
    "~^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$" $upstream_http_x_mail_request_id;
}
map $realip_remote_addr $mooncci_mail_ingress {
    default ENTRY;
    107.174.123.42 US_PROXY;
}
log_format mooncci_mail_timing escape=json
    '{"event":"mailbox_http","completed_at":"$time_iso8601","at_s":"$msec",'
    '"request_id":"$mooncci_mail_id","nginx_request_id":"$request_id",'
    '"path":"$mooncci_mail_route","method":"$request_method","status":$status,'
    '"entry":"$mooncci_mail_ingress","request_time":"$request_time",'
    '"upstream_connect_time":"$upstream_connect_time",'
    '"upstream_header_time":"$upstream_header_time",'
    '"upstream_response_time":"$upstream_response_time"}';
'''.replace('ENTRY', 'CN_DIRECT' if entry == 'CN' else 'US_PROXY').encode()


def site_config(data, entry):
    text = data.decode()
    log = 'access_log /www/wwwlogs/mooncci-mail-timing.log mooncci_mail_timing if=$mooncci_mail_loggable;'
    if entry == 'CN':
        needle = 'access_log  /www/wwwlogs/mooncci.site.log;'
        if text.count(needle) != 1 or text.count('proxy_pass http://127.0.0.1:3001/api/;') != 1:
            raise ValueError('CN vhost differs from reviewed configuration')
        text = text.replace(needle, needle + '\n    ' + log)
        text = text.replace('proxy_pass http://127.0.0.1:3001/api/;', 'proxy_pass http://127.0.0.1:3001/api/;\n    proxy_set_header X-Mooncci-Mail-Ingress $mooncci_mail_ingress;')
    else:
        needle = '    access_log off;\n    error_log /www/wwwlogs/mooncci-geo-gateway-error.log warn;'
        if text.count(needle) != 1:
            raise ValueError('US vhost differs from reviewed configuration')
        text = text.replace(needle, '    ' + log + '\n    error_log /www/wwwlogs/mooncci-geo-gateway-error.log warn;')
    return text.encode()


def restore(backup):
    if backup.parent != Path('/www/backup') or not backup.name.startswith('mooncci-mail-observe.'):
        raise ValueError('Unexpected backup location')
    rows = json.loads((backup / 'manifest.json').read_text())
    for row in rows:
        p = Path(row['path'])
        if p not in (SITE, EXTRA): raise ValueError('Unexpected target')
        if digest(p.read_bytes() if p.exists() else None) not in (row['before'], row['after']):
            raise ValueError('Configuration changed since installation')
    for i, row in enumerate(rows):
        p = Path(row['path'])
        if row['before'] is None:
            if p.exists(): p.unlink()
        else: atomic(p, (backup / str(i)).read_bytes())
    subprocess.run([NGINX, '-t'], check=True)
    subprocess.run([NGINX, '-s', 'reload'], check=True)


def main():
    with open('/www/backup/mooncci-deploy.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if sys.argv[1] == 'rollback':
            restore(Path(sys.argv[2]).resolve()); print('OBSERVATION_ROLLED_BACK'); return
        entry = sys.argv[2]
        if sys.argv[1] != 'install' or entry not in ('CN', 'US'): raise ValueError('Expected install CN|US')
        if EXTRA.exists(): raise ValueError('Observation include already exists; inspect before replacing')
        previous = SITE.read_bytes()
        targets = [(SITE, previous, site_config(previous, entry)), (EXTRA, None, config(entry))]
        backup = Path(tempfile.mkdtemp(prefix='mooncci-mail-observe.', dir='/www/backup'))
        rows = []
        for i, (p, old, new) in enumerate(targets):
            if old is not None: (backup / str(i)).write_bytes(old)
            rows.append(dict(path=str(p), before=digest(old), after=digest(new)))
        (backup / 'manifest.json').write_text(json.dumps(rows))
        (backup / 'nginx-observation.py').write_bytes(Path(__file__).read_bytes())
        try:
            for p, old, new in targets: atomic(p, new)
            subprocess.run([NGINX, '-t'], check=True)
            subprocess.run([NGINX, '-s', 'reload'], check=True)
        except Exception:
            restore(backup); raise
        print('OBSERVATION_BACKUP=' + str(backup))


if __name__ == '__main__': main()
