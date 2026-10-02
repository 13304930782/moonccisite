import argparse
import json
import os
from pathlib import Path
import socket
import sys
import time
sys.dont_write_bytecode=True
from install import atomic,command,digest,transaction,verify_package,NGINX
from primary_ip import patch,MARK,PROBE
from verify import request
TARGET=Path('/www/server/panel/vhost/nginx/mooncci.site.conf')
def health():
    status,h,body=request('127.0.0.1',PROBE,['-H','X-Forwarded-For: 203.0.113.77'])
    if status!=200 or body.strip()!=b'127.0.0.1':raise ValueError('Untrusted forged IP rejection failed')
    status,h,body=request('127.0.0.1','/api/posts?format=paged&page=1&pageSize=1')
    if status!=200:raise ValueError('Main API health failed')
    json.loads(body)
    print('PASS local forged-IP rejection and main API',flush=True)
def main():
    a=argparse.ArgumentParser();a.add_argument('--rollback');args=a.parse_args()
    if os.geteuid()!=0 or socket.gethostname()!='moooncci.cn':raise ValueError('Run only as root on verified CN host')
    import fcntl
    with open('/run/mooncci-cn-ip.lock','w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        verify_package(Path(__file__).resolve().parent)
        if TARGET.is_symlink() or not TARGET.is_file():raise ValueError('Main vhost missing or symlink')
        check=lambda:command([NGINX,'-t'])
        reload=lambda:command([NGINX,'-s','reload'])
        check()
        if args.rollback:
            backup=Path(args.rollback).resolve()
            if backup.parent!=Path('/www/backup') or not backup.name.startswith('mooncci-cn-ip-'):raise ValueError('Invalid backup')
            state=json.loads((backup/'state.json').read_text());old=(backup/'original.conf').read_bytes()
            if state['target']!=str(TARGET) or state['status']!='installed' or digest(TARGET.read_bytes())!=state['new_sha256'] or digest(old)!=state['old_sha256']:raise ValueError('Modified config/backup; rollback refused')
            current=TARGET.read_bytes();atomic(TARGET,old,state['old_mode'])
            try:check();reload()
            except Exception:atomic(TARGET,current);check();reload();raise
            state['status']='manual-rollback';(backup/'state.json').write_text(json.dumps(state)+'\n')
            print('CN IP patch rolled back');return
        old=TARGET.read_text()
        if MARK in old:health();print('Already installed');return
        data=patch(old).encode()
        backup=Path('/www/backup')/('mooncci-cn-ip-'+time.strftime('%Y%m%d%H%M%S')+'-'+str(os.getpid()))
        print('Backup: '+str(backup),flush=True)
        def checked_health():
            for attempt in range(3):
                try:health();return
                except Exception:
                    if attempt==2:raise
                    time.sleep(2)
        transaction(TARGET,data,backup,check,reload,checked_health)
        print('CN IP deployment complete; trusted gateway=107.174.123.42',flush=True)
        print('Rollback: python3 '+str(Path(__file__).resolve())+' --rollback '+str(backup),flush=True)
if __name__=='__main__':
    try:main()
    except Exception as e:print('STOPPED: '+str(e),file=sys.stderr);sys.exit(1)
