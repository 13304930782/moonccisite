#!/usr/bin/env python3
"""Scoped test vhost deployment. Python 3.6+. No PM2, SQL, DNS or certificate writes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time
import sys
sys.dont_write_bytecode = True
from render import render, HOST

CONF = Path('/www/server/panel/vhost/nginx/mooncci.site.conf')
NGINX = '/www/server/nginx/sbin/nginx'
CERT = '/www/server/panel/vhost/cert/mooncci.site/fullchain.pem'
KEY = '/www/server/panel/vhost/cert/mooncci.site/privkey.pem'

def digest(data): return hashlib.sha256(data).hexdigest()

def atomic(path, data, mode=0o600):
    fd, name = tempfile.mkstemp(prefix='.mooncci-geo-', dir=str(path.parent))
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data);stream.flush();os.fsync(stream.fileno())
        os.chmod(name, mode)
        os.replace(name, str(path))
    finally:
        if os.path.exists(name): os.unlink(name)

def command(args):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=40)
    if result.returncode:
        # Never echo config lines, private headers or credentials from subprocess output.
        raise RuntimeError('Command failed: ' + Path(args[0]).name + ' ' + (' '.join(args[1:]) if args[0]==NGINX else '(details withheld)'))
    return result.stdout

def validate_old(text):
    stripped = re.sub(r'(?m)#.*$', '', text)
    names = re.findall(r'\bserver_name\s+([^;]+);', stripped)
    if not names or any(x.split()!=[HOST] for x in names):
        raise ValueError('Target vhost must contain only the test hostname')
    for directive, expected in [('ssl_certificate',CERT),('ssl_certificate_key',KEY)]:
        values=re.findall(r'\b'+directive+r'\s+([^;]+);',stripped)
        if not values or any(v.strip().strip('"\'')!=expected for v in values):
            raise ValueError('Certificate paths differ from verified setup')

def verify_package(root):
    entries={}
    for line in (root/'SHA256SUMS').read_text().splitlines():
        sha,name=line.split('  ',1)
        if not re.fullmatch(r'[0-9a-f]{64}',sha) or not re.fullmatch(r'[A-Za-z0-9_.-]+',name) or name in entries:
            raise ValueError('Invalid manifest')
        path=root/name
        if path.is_symlink() or not path.is_file() or digest(path.read_bytes())!=sha:raise ValueError('Package checksum failed')
        entries[name]=sha
    if set(x.name for x in root.iterdir()) != set(entries)|{'SHA256SUMS'}:raise ValueError('Unexpected package member')

def probe(region):
    from verify import verify
    verify(region, '127.0.0.1')


def transaction(target, data, backup, check, reload, health):
    old=target.read_bytes();mode=target.stat().st_mode & 0o777
    backup.mkdir(mode=0o700)
    shutil.copy2(str(target),str(backup/'original.conf'))
    os.chmod(str(backup/'original.conf'),0o600)
    state={'target':str(target),'old_sha256':digest(old),'new_sha256':digest(data),'old_mode':mode,'status':'prepared'}
    (backup/'state.json').write_text(json.dumps(state,indent=2)+'\n')
    atomic(target,data)
    try:
        check();reload();health()
    except Exception:
        if digest(target.read_bytes())!=digest(data):raise RuntimeError('Concurrent edit detected; restore stopped; inspect backup')
        atomic(target,old,mode)
        check();reload()
        state['status']='rolled-back';(backup/'state.json').write_text(json.dumps(state,indent=2)+'\n')
        raise RuntimeError('US gateway deployment failed; original test vhost restored and reloaded')
    state['status']='installed';(backup/'state.json').write_text(json.dumps(state,indent=2)+'\n')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--region',choices=['US']);parser.add_argument('--rollback')
    args=parser.parse_args()
    if os.geteuid()!=0:raise ValueError('Root required')
    import fcntl
    with open('/run/mooncci-geo-preview.lock','w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        verify_package(Path(__file__).resolve().parent)
        if CONF.is_symlink() or not CONF.is_file():raise ValueError('Expected regular BaoTa test config missing')
        check=lambda:command([NGINX,'-t'])
        reload=lambda:command([NGINX,'-s','reload'])
        check()
        if args.rollback:
            backup=Path(args.rollback).resolve()
            if backup.parent!=Path('/www/backup') or not backup.name.startswith('mooncci-us-gateway-'):raise ValueError('Invalid backup path')
            state=json.loads((backup/'state.json').read_text())
            if state['target']!=str(CONF) or state['status']!='installed' or digest(CONF.read_bytes())!=state['new_sha256']:raise ValueError('Unknown current changes; rollback refused')
            old=(backup/'original.conf').read_bytes()
            if digest(old)!=state['old_sha256']:raise ValueError('Backup modified')
            current=CONF.read_bytes();atomic(CONF,old,state['old_mode'])
            try:check();reload()
            except Exception:
                atomic(CONF,current);check();reload();raise
            state['status']='manual-rollback';(backup/'state.json').write_text(json.dumps(state,indent=2)+'\n')
            print('Original test vhost restored.');return
        if not args.region:raise ValueError('--region required')
        expected={'CN':'moooncci.cn','US':'mail.cuegroveapp.com'}
        if socket.gethostname()!=expected[args.region]:raise ValueError('Hostname mismatch; wrong server or unverified host')
        validate_old(CONF.read_text())
        if not all(Path(x).is_file() for x in (CERT,KEY)):raise ValueError('Certificate missing')
        reader_key=None
        if args.region=='US':
            env=Path('/etc/mooncci-reader.env').read_text()
            match=re.search(r'^READER_KEY=([a-fA-F0-9]{64})\s*$',env,re.M)
            if not match:raise ValueError('Reader key configuration missing')
            reader_key=match.group(1)
        elif not Path('/www/wwwroot/mooncci.site/index.html').is_file():raise ValueError('Primary frontend missing')
        port=3102 if args.region=='US' else 3001
        with socket.create_connection(('127.0.0.1',port),timeout=3):pass
        ca=next((p for p in ('/etc/ssl/certs/ca-certificates.crt','/etc/pki/tls/certs/ca-bundle.crt') if Path(p).is_file()),None)
        if not ca:raise ValueError('System CA bundle missing')
        from verify import request, verify_origin_ip
        verify_origin_ip()
        status,headers,body=request('182.92.179.81','/api/posts?format=paged&page=1&pageSize=1')
        if status!=200 or 'application/json' not in headers.get('content-type',''):raise ValueError('Pinned primary TLS/API preflight failed')
        json.loads(body)
        data=render(args.region,CERT,KEY,reader_key,ca).encode()
        if CONF.read_bytes()==data:
            probe(args.region);print('Already installed; no files changed.');return
        root=Path('/www/backup');root.mkdir(exist_ok=True)
        backup=root/('mooncci-us-gateway-'+args.region+'-'+time.strftime('%Y%m%d%H%M%S')+'-'+str(os.getpid()))
        print('Backup: '+str(backup),flush=True)
        def health():
            for attempt in range(3):
                try:probe(args.region);return
                except Exception:
                    if attempt==2:raise
                    time.sleep(2)
        transaction(CONF,data,backup,check,reload,health)
        print('Gateway deployment complete: US formal hostname only; node='+args.region,flush=True)
        print('Rollback: python3 '+str(Path(__file__).resolve())+' --rollback '+str(backup),flush=True)

if __name__=='__main__':
    try:main()
    except Exception as error:
        print('STOPPED: '+str(error),file=sys.stderr);sys.exit(1)
