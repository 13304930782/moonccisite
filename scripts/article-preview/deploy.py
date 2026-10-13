#!/usr/bin/env python3
"""PR 93 only: static files + matching SSR; no business source, SQL or env writes."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import uuid

LIVE = Path('/www/wwwroot/mooncci-source/server')
MAIN = Path('/www/wwwroot/mooncci.site')
NODE = '/opt/mooncci-node-v24.20.0/bin/node'
BACKUPS = Path('/www/backup')
CONFIG = ['max_memory_restart', 'node_args', 'exec_interpreter', 'pm_exec_path', 'pm_cwd']
digest = lambda data: hashlib.sha256(data).hexdigest()

def files(root):
    if root.is_symlink(): raise ValueError('Symlink root refused: '+str(root))
    result = {}
    for file in sorted(root.rglob('*')):
        if file.is_symlink(): raise ValueError('Symlink refused: '+str(file))
        if file.is_file(): result[file.relative_to(root).as_posix()] = digest(file.read_bytes())
        elif not file.is_dir(): raise ValueError('Nonregular path: '+str(file))
    return result

def plain(root, name):
    if not re.fullmatch(r'[A-Za-z0-9_@+.,/-]+', name) or any(p in ('', '.', '..') for p in name.split('/')):
        raise ValueError('Unsafe relative path')
    result = root
    for part in name.split('/'):
        result = result / part
        if result.is_symlink(): raise ValueError('Symlink refused: '+str(result))
    if result.exists() and not result.is_file(): raise ValueError('Not a plain file: '+str(result))
    return result

def hashes(root, names):
    return {name:digest(plain(root,name).read_bytes()) if plain(root,name).exists() else None for name in names}

def dump(file, value):
    file.write_text(json.dumps(value, indent=2)+'\n');file.chmod(0o600)

def readable_parents(target, root):
    missing=[];parent=target.parent
    while parent!=root and not parent.exists():missing.append(parent);parent=parent.parent
    for directory in reversed(missing):directory.mkdir();directory.chmod(0o755)

def copy_to_empty(source, destination):
    # Python 3.6 has no copytree(dirs_exist_ok=...). This stage must be empty.
    if any(destination.iterdir()):raise ValueError('Runtime stage must be empty')
    for item in source.iterdir():
        target=destination/item.name
        if item.is_dir():shutil.copytree(str(item),str(target))
        else:shutil.copy2(str(item),str(target))

def unlink_if_present(file):
    try:file.unlink()
    except FileNotFoundError:pass

def verify_package(root):
    manifest=json.loads((root/'MANIFEST.json').read_text())
    if manifest['release']!='article-preview-pr93' or manifest['target'] not in ('main','reader'):
        raise ValueError('Wrong release package')
    if manifest['backend_files'] or manifest['migrations'] or manifest['configuration_changes']:
        raise ValueError('Unexpected write scope')
    listed={}
    for line in (root/'SHA256SUMS').read_text().splitlines():
        sha,name=line.split('  ',1)
        if not re.fullmatch('[a-f0-9]{64}',sha) or name in listed: raise ValueError('Invalid checksum list')
        listed[name]=sha
    if files(root)!={**listed,'SHA256SUMS':digest((root/'SHA256SUMS').read_bytes())}:
        raise ValueError('Package file set or bytes differ')
    metadata={'MANIFEST.json','deploy.py','deploy.sh','rollback.sh','accept.cjs','SHA256SUMS'}
    for name in files(root):
        if name not in metadata and not name.startswith('dist/') and not (manifest['target']=='main' and name.startswith('server/runtime/')):
            raise ValueError('File outside release scope: '+name)
        if name.endswith('.node') or any(p in ('.env','uploads','database','schema.sql') for p in name.split('/')):
            raise ValueError('Forbidden release file: '+name)
    for name in ('deploy.py','deploy.sh','rollback.sh','accept.cjs','MANIFEST.json','SHA256SUMS'):
        if b'\r' in (root/name).read_bytes(): raise ValueError('CRLF metadata refused')
    if manifest['target']=='main':
        for name in ('document.mjs','styles.json','home.css','node_modules/jsdom/package.json'):
            if not (root/'server/runtime'/name).is_file(): raise ValueError('Missing SSR dependency: '+name)
        for group in json.loads((root/'server/runtime/styles.json').read_text()).values():
            for url in group.get('css',[])+group.get('js',[]):
                if not plain(root,'dist'+url).is_file(): raise ValueError('Missing SSR resource: '+url)
    return manifest

def tar_backup(root, names, output):
    expected=hashes(root,names)
    with tarfile.open(output,'w') as archive:
        for name,value in expected.items():
            if value is not None: archive.add(plain(root,name),arcname=name,recursive=False)
    verify_tar(output,expected)

def verify_tar(file, expected):
    expected={k:v for k,v in expected.items() if v is not None}
    with tarfile.open(file) as archive:
        members=archive.getmembers()
        if len(members)!=len(expected) or {m.name for m in members}!=set(expected): raise ValueError('Backup file set differs')
        for item in members:
            if not item.isfile() or item.issym() or item.islnk() or digest(archive.extractfile(item).read())!=expected[item.name]:
                raise ValueError('Backup bytes differ: '+item.name)

def restore_tar(file, root, expected, defer_index=False):
    verify_tar(file,expected)
    index=None
    with tarfile.open(file) as archive:
        for item in archive.getmembers():
            if defer_index and item.name=='index.html':
                index=archive.extractfile(item).read();continue
            target=plain(root,item.name);target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(archive.extractfile(item).read());target.chmod(item.mode & 0o777)
            if os.geteuid()==0 and (target.stat().st_uid!=item.uid or target.stat().st_gid!=item.gid): os.chown(target,item.uid,item.gid)
    return index

def pm(args):
    result=subprocess.run(['su','-s','/bin/bash','mooncci','-c','export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 '+args],
                          stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True,timeout=60)
    if result.returncode: raise RuntimeError('PM2 command failed; inspect PM2 directly')
    return result.stdout

def pm_snapshot():
    rows=json.loads(pm('jlist'));result={}
    for name in ('mooncci-api','mooncci-worker'):
        found=[row for row in rows if row['name']==name]
        if len(found)!=1 or found[0]['pm2_env']['status']!='online': raise ValueError('Process unavailable: '+name)
        env=found[0]['pm2_env'];result[name]={key:env.get(key) for key in CONFIG};result[name]['pid']=found[0]['pid']
    if result['mooncci-api']['max_memory_restart']!=450*1024*1024:
        raise ValueError('Expected current API 450M budget; configuration has not been changed')
    return result

def check_pm(before):
    after=pm_snapshot()
    for name in before:
        if any(before[name][key]!=after[name][key] for key in CONFIG): raise ValueError('PM2 configuration changed: '+name)
    if after['mooncci-worker']['pid']!=before['mooncci-worker']['pid']: raise ValueError('Worker PID changed')
    return after

def accept(root, stage=None):
    subprocess.run([NODE,str(root/'accept.cjs'),'stage' if stage else 'public',str(stage or root),str(LIVE)],check=True,timeout=180)

def rollback(backup, restart=True):
    if not (backup/'BEFORE.json').is_file(): raise ValueError('Missing backup snapshot')
    before=json.loads((backup/'BEFORE.json').read_text());web=Path(before['web']);live=Path(before['live'])
    for name in ('deploy.py','rollback.sh','accept.cjs','BEFORE.json','frontend-before.tar')+(() if before['target']=='reader' else ('runtime-before.tar',)):
        expected=json.loads((backup/'BACKUP_HASHES.json').read_text())[name]
        if digest((backup/name).read_bytes())!=expected: raise ValueError('Backup changed: '+name)
    verify_tar(backup/'frontend-before.tar',before['frontend'])
    if before['target']=='main': verify_tar(backup/'runtime-before.tar',before['runtime'])
    # Assets first, original index last. Retain every unrelated/old hash asset.
    index=restore_tar(backup/'frontend-before.tar',web,before['frontend'],defer_index=True)
    for name,value in before['frontend'].items():
        if value is None: unlink_if_present(plain(web,name))
    if before['target']=='main':
        stage=Path(tempfile.mkdtemp(prefix='.runtime-preview-restore.',dir=live))
        restore_tar(backup/'runtime-before.tar',stage,before['runtime'])
        if restart:
            subprocess.run(['chown','-R','mooncci:mooncci',str(stage)],check=True)
            subprocess.run(['chmod','-R','u=rwX,go=rX',str(stage)],check=True)
        current=live/'runtime'
        if current.exists(): current.rename(live/('.runtime-preview-failed.'+uuid.uuid4().hex))
        stage.rename(current)
    if index is not None:
        temporary=web/'.index-preview-rollback';temporary.write_bytes(index);temporary.chmod(0o644);temporary.replace(web/'index.html')
    if hashes(web,before['frontend'])!=before['frontend']: raise ValueError('Frontend rollback verification failed')
    if before['target']=='main' and files(live/'runtime')!=before['runtime']: raise ValueError('SSR rollback verification failed')
    if restart and before['target']=='main':
        pm('restart mooncci-api');check_pm(before['pm2'])
        subprocess.run([NODE,str(backup/'accept.cjs'),'health',str(backup),str(LIVE)],check=True,timeout=70)
    print('PASS: rollback restored the captured frontend and complete SSR bytes',flush=True)

def deploy(root,web,live,backup_base,callbacks=None):
    manifest=verify_package(root);main=manifest['target']=='main'
    backup=Path(tempfile.mkdtemp(prefix='mooncci-preview-'+manifest['target']+'.',dir=backup_base))
    print('BACKUP='+str(backup),flush=True)
    names=list(files(root/'dist'))
    before={'target':manifest['target'],'web':str(web),'live':str(live),'frontend':hashes(web,names),'runtime':files(live/'runtime') if main else {},'pm2':{}}
    if before['frontend'].get('index.html') is None: raise ValueError('Missing live frontend index')
    expected=manifest['prerequisites'] if main else {}
    if main and hashes(live,expected)!=expected: raise ValueError('Backend does not match deployed PR 92; stopped before writes')
    before['pm2']=(callbacks['pm']() if callbacks else pm_snapshot()) if main else {}
    dump(backup/'BEFORE.json',before)
    for name in ('deploy.py','rollback.sh','accept.cjs'):shutil.copy2(root/name,backup/name)
    tar_backup(web,names,backup/'frontend-before.tar')
    if main: tar_backup(live/'runtime',list(before['runtime']),backup/'runtime-before.tar')
    backup_names=['BEFORE.json','deploy.py','rollback.sh','accept.cjs','frontend-before.tar']+(['runtime-before.tar'] if main else [])
    dump(backup/'BACKUP_HASHES.json',{name:digest((backup/name).read_bytes()) for name in backup_names})
    stage=None;changed=False
    try:
        if main:
            stage=Path(tempfile.mkdtemp(prefix='.runtime-preview-stage.',dir=live))
            copy_to_empty(root/'server/runtime',stage)
            if files(stage)!=files(root/'server/runtime'): raise ValueError('Staged SSR bytes differ')
            if callbacks: callbacks['stage'](stage)
            else:
                subprocess.run(['chown','-R','mooncci:mooncci',str(stage)],check=True)
                subprocess.run(['chmod','-R','u=rwX,go=rX',str(stage)],check=True)
                accept(root,stage)
        if hashes(web,names)!=before['frontend'] or main and (files(live/'runtime')!=before['runtime'] or hashes(live,expected)!=expected):
            raise ValueError('Live files changed during preflight; stopped before writes')
        if main and not callbacks: check_pm(before['pm2'])
        changed=True
        for name in names:
            if name=='index.html': continue
            target=plain(web,name);readable_parents(target,web)
            shutil.copyfile(root/'dist'/name,target);target.chmod(0o644)
        if main:
            (live/'runtime').rename(live/('.runtime-preview-prior.'+uuid.uuid4().hex))
            stage.rename(live/'runtime');stage=None
        temporary=web/'.index-preview-new';shutil.copyfile(root/'dist/index.html',temporary);temporary.chmod(0o644);temporary.replace(web/'index.html')
        if hashes(web,names)!=files(root/'dist') or main and files(live/'runtime')!=files(root/'server/runtime'):
            raise ValueError('Installed bytes differ')
        if callbacks: callbacks['installed']()
        elif main:
            pm('restart mooncci-api')
            accept(root)
            dump(backup/'pm2-after.json',check_pm(before['pm2']))
        if main and hashes(live,expected)!=expected: raise ValueError('Business source unexpectedly changed')
        print('PASS: PR 93 '+manifest['target']+' release; original assets, config, uploads and SQL retained',flush=True)
        (backup/'exit-code').write_text('0\n')
    except BaseException:
        if changed:
            try: rollback(backup,restart=callbacks is None)
            except BaseException as error: print('ROLLBACK NEEDS ATTENTION: '+str(error),flush=True)
        (backup/'exit-code').write_text('1\n')
        raise
    finally:
        if stage is not None: print('STAGED_RUNTIME='+str(stage),flush=True)
    return backup

def main():
    os.umask(0o077)
    BACKUPS.mkdir(exist_ok=True)
    with (BACKUPS/'mooncci-deploy.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        root=Path(__file__).resolve().parent
        if len(sys.argv)>1 and sys.argv[1]=='rollback':
            backup=Path(sys.argv[2]).resolve()
            if backup.parent!=BACKUPS or not backup.name.startswith('mooncci-preview-'): raise ValueError('Unexpected backup path')
            before=json.loads((backup/'BEFORE.json').read_text());web=Path(before['web'])
            if before['live']!=str(LIVE) or before['target']=='main' and web!=MAIN or before['target']=='reader' and web!=Path('/opt/mooncci-reader/current/dist').resolve(): raise ValueError('Rollback root mismatch')
            rollback(backup);return
        manifest=verify_package(root)
        web=MAIN if manifest['target']=='main' else Path('/opt/mooncci-reader/current/dist').resolve()
        if web.resolve()!=web or manifest['target']=='reader' and not re.fullmatch('/opt/mooncci-reader/releases/[^/]+/dist',str(web)): raise ValueError('Unexpected web root')
        if manifest['target']=='main' and (LIVE.resolve()!=LIVE or not Path(NODE).is_file()): raise ValueError('Unexpected main runtime')
        deploy(root,web,LIVE,BACKUPS)

if __name__=='__main__':
    try: main();print('EXIT_CODE=0',flush=True)
    except BaseException as error: print('ERROR: '+str(error)+'\nEXIT_CODE=1',flush=True);sys.exit(1)
