#!/usr/bin/env python3
"""China origin only: one vhost patch, checksum verification, backup and automatic rollback."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import sys
sys.dont_write_bytecode = True
from patch import patch
from validation_probe import collect

VHOST = Path('/www/server/panel/vhost/nginx/mooncci.site.conf')
NGINX = '/www/server/nginx/sbin/nginx'
IMAGE = '/api/uploads/import-c75fb0e91471-bfafc384e05b5c98e6e9.webp'

def digest(data): return hashlib.sha256(data).hexdigest()

def command(args):
    result = subprocess.run(args, capture_output=True, timeout=40)
    if result.returncode: raise RuntimeError('Command failed: ' + Path(args[0]).name)
    return result.stdout

def atomic(data, metadata):
    fd, name = tempfile.mkstemp(prefix='.mooncci-origin-validator-', dir=str(VHOST.parent))
    try:
        with os.fdopen(fd, 'wb') as stream:
            os.fchmod(stream.fileno(), metadata.st_mode & 0o777)
            os.fchown(stream.fileno(), metadata.st_uid, metadata.st_gid)
            stream.write(data); stream.flush(); os.fsync(stream.fileno())
        os.replace(name, str(VHOST))
    finally:
        if os.path.exists(name): os.unlink(name)

def probe(path, cookie=False):
    with tempfile.TemporaryDirectory() as directory:
        header = Path(directory)/'headers'; body = Path(directory)/'body'
        args = ['curl', '--noproxy', '*', '--silent', '--show-error', '--resolve', 'mooncci.site:443:127.0.0.1', '--connect-timeout', '5', '--max-time', '20', '--dump-header', str(header), '--output', str(body), '--write-out', '%{http_code}', 'https://mooncci.site'+path]
        if cookie: args += ['--header', 'Cookie: mooncci_cache_probe=1']
        code = int(command(args))
        headers = {}
        for line in header.read_text(errors='replace').splitlines():
            if ':' in line:
                key, value = line.split(':', 1); headers.setdefault(key.lower(), []).append(value.strip())
        return {'status': code, 'cache': headers.get('cache-control', []), 'sha256': digest(body.read_bytes()), 'bytes': body.stat().st_size, 'node': headers.get('x-mooncci-node', [])}

def verify_package():
    root = Path(__file__).resolve().parent
    expected = set()
    for line in (root/'SHA256SUMS').read_text().splitlines():
        sha, name = line.split('  ', 1)
        if not re.fullmatch(r'[A-Za-z0-9_.-]+', name) or name in expected: raise ValueError('Invalid manifest')
        expected.add(name)
        item = root/name
        if item.is_symlink() or digest(item.read_bytes()) != sha: raise ValueError('Checksum mismatch')
    if {p.name for p in root.iterdir()} != expected | {'SHA256SUMS'}: raise ValueError('Unexpected package files')

def deploy():
    original = VHOST.read_bytes(); metadata = VHOST.stat()
    names = re.findall(r'\bserver_name\s+([^;]+);', original.decode())
    if not names or any(set(name.split()) != {'mooncci.site','www.mooncci.site'} for name in names): raise ValueError('Unexpected hostname')
    updated = patch(original.decode()).encode()
    command([NGINX, '-t'])
    before = probe(IMAGE)
    if before['status'] != 200 or before['cache'] != ['public, max-age=0']: raise ValueError('Unexpected live baseline')
    backup = Path(tempfile.mkdtemp(prefix='mooncci-origin-validator-', dir='/www/backup'))
    backup.chmod(0o700)
    (backup/'mooncci.site.conf').write_bytes(original)
    (backup/'mooncci.site.conf').chmod(0o600)
    (backup/'metadata.json').write_text(json.dumps({'before_sha256': digest(original), 'after_sha256': digest(updated)}))
    print('BACKUP='+str(backup), flush=True)
    if VHOST.read_bytes() != original: raise RuntimeError('Configuration changed during preflight')
    try:
        atomic(updated, metadata)
        command([NGINX, '-t']); command([NGINX, '-s', 'reload']); time.sleep(3)
        after = probe(IMAGE)
        validation = collect()
        rows=validation['results']
        if len(rows)!=6 or any('error' in row or row['baseline']['status']!=200 or any(row.get(mode,{}).get('status')!=304 or row[mode]['bytes']!=0 for mode in ['etag','modified']) for row in rows): raise RuntimeError('Backend/Nginx validator acceptance failed')
        if after['status']!=200 or after['sha256']!=before['sha256'] or after['cache']!=before['cache']: raise RuntimeError('Image body/cache policy changed')
        page=probe('/')
        missing=probe('/api/uploads/mooncci-validator-missing.webp')
        if page['status']!=200 or missing['status']!=404: raise RuntimeError('Page/error regression')
        (backup/'verification.json').write_text(json.dumps({'before':before,'after':after,'validation':validation,'page':page,'missing':missing},indent=2))
        print('PASS: both validators return 304/0 bytes through backend and Nginx; image unchanged; homepage/error checks passed. No PM2/database/DNS changes.',flush=True)
        print('ROLLBACK: python3 '+str(Path(__file__).resolve())+' --rollback '+str(backup), flush=True)
    except BaseException:
        if VHOST.read_bytes() != updated: raise RuntimeError('Concurrent configuration change; automatic rollback stopped. Backup: '+str(backup))
        atomic(original, metadata)
        command([NGINX, '-t']); command([NGINX, '-s', 'reload'])
        print('ROLLED_BACK='+str(backup), flush=True)
        raise

def rollback(directory):
    backup = Path(directory).resolve()
    if backup.parent != Path('/www/backup') or not backup.name.startswith('mooncci-origin-validator-'): raise ValueError('Unexpected backup path')
    current = VHOST.read_bytes(); metadata = VHOST.stat()
    manifest = json.loads((backup/'metadata.json').read_text())
    original = (backup/'mooncci.site.conf').read_bytes()
    if digest(current) != manifest['after_sha256'] or digest(original) != manifest['before_sha256']: raise ValueError('Configuration changed; manual review needed')
    try:
        atomic(original, metadata); command([NGINX, '-t']); command([NGINX, '-s', 'reload'])
    except BaseException:
        atomic(current, metadata); command([NGINX, '-t']); command([NGINX, '-s', 'reload']); raise
    print('ROLLBACK_PASS', flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--rollback'); args = parser.parse_args()
    if os.geteuid() != 0 or not Path('/www/wwwroot/mooncci-source/server/src/index.js').exists(): raise SystemExit('Run on China origin as root')
    verify_package()
    if args.rollback: rollback(args.rollback)
    else: deploy()
