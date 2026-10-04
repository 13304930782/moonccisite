#!/usr/bin/env python3
"""One-directive US gateway change, guarded backup and immediate rollback.

Usage: preview | apply EXPECTED_SHA256 | rollback BACKUP_DIRECTORY
Never changes upstream routing, TLS validation, API processes or mail services.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import ssl
import socket
import subprocess
import sys
import tempfile

SITE = Path('/www/server/panel/vhost/nginx/mooncci.site.conf')
NGINX = '/www/server/nginx/sbin/nginx'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def candidate(data):
    text = data.decode('utf-8')
    needle = '    listen 443 ssl;'
    if text.count(needle) != 1 or len(re.findall(r'^\s*server_name mooncci\.site;', text, re.M)) != 2:
        raise ValueError('Unexpected vhost layout; review before changing')
    if re.search(r'^\s*http2\s', text, re.M):
        raise ValueError('Explicit HTTP/2 configuration already exists')
    return text.replace(needle, needle + '\n    http2 on;', 1).encode('utf-8')


def atomic(data):
    temporary = SITE.with_name(SITE.name + '.http2-tmp')
    temporary.write_bytes(data)
    shutil.copystat(str(SITE), str(temporary))
    stat = SITE.stat()
    os.chown(str(temporary), stat.st_uid, stat.st_gid)
    os.replace(str(temporary), str(SITE))


def nginx(*args):
    # Keep full config/error output out of user-visible logs.
    result = subprocess.run([NGINX] + list(args), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError('Nginx command failed: ' + ' '.join(args))


def verify():
    context = ssl.create_default_context()
    context.set_alpn_protocols(['h2', 'http/1.1'])
    with socket.create_connection(('127.0.0.1', 443), timeout=10) as connection:
        with context.wrap_socket(connection, server_hostname='mooncci.site') as tls:
            if tls.selected_alpn_protocol() != 'h2':
                raise RuntimeError('Gateway did not negotiate h2')
    for protocol, expected in [('--http2', '200 2'), ('--http1.1', '200 1.1')]:
        result = subprocess.run(['curl', '--noproxy', '*', protocol, '--max-time', '20',
            '--resolve', 'mooncci.site:443:127.0.0.1', '-sS', '-o', '/dev/null',
            '-w', '%{http_code} %{http_version}', 'https://mooncci.site/api/posts?pageSize=1'],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
        if result.returncode or result.stdout != expected:
            raise RuntimeError('HTTPS health check failed for ' + protocol)


def restore(backup):
    backup = backup.resolve()
    if backup.parent != Path('/www/backup') or not backup.name.startswith('mooncci-us-http2.'):
        raise ValueError('Unexpected backup path')
    manifest = json.loads((backup / 'manifest.json').read_text())
    data = (backup / 'site.before').read_bytes()
    if digest(data) != manifest['before'] or digest(SITE.read_bytes()) not in (manifest['before'], manifest['after']):
        raise ValueError('Configuration drift; refusing to overwrite newer changes')
    current = SITE.read_bytes()
    atomic(data)
    try:
        nginx('-t')
        nginx('-s', 'reload')
    except Exception:
        atomic(current)
        raise
    print(json.dumps({'restored': str(backup)}))


def main():
    mode = sys.argv[1]
    if mode == 'rollback':
        restore(Path(sys.argv[2]))
        return
    before = SITE.read_bytes()
    after = candidate(before)
    if mode == 'preview':
        print(json.dumps({'before': digest(before), 'after': digest(after), 'change': 'add http2 on to US mooncci.site TLS server'}))
        return
    if mode != 'apply' or digest(before) != sys.argv[2]:
        raise ValueError('Expected reviewed SHA256 required')
    nginx('-t')
    backup = Path(tempfile.mkdtemp(prefix='mooncci-us-http2.', dir='/www/backup'))
    (backup / 'site.before').write_bytes(before)
    (backup / 'manifest.json').write_text(json.dumps({'before': digest(before), 'after': digest(after)}))
    try:
        atomic(after)
        nginx('-t')
        nginx('-s', 'reload')
        # Reload is graceful; curl retries here are GET-only health checks.
        import time
        for attempt in range(5):
            try:
                verify()
                break
            except Exception:
                if attempt == 4:
                    raise
                time.sleep(1)
    except Exception:
        restore(backup)
        raise
    print(json.dumps({'installed': True, 'backup': str(backup), 'http2': True, 'http1_fallback': True}))


if __name__ == '__main__':
    with open('/tmp/mooncci-us-http2.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        main()
