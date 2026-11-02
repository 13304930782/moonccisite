"""Reviewed dependency/document patch; no source, environment, uploads or SQL writes."""
import hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile, time, urllib.request

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def safe(root, name):
    relative=pathlib.PurePosixPath(name)
    if relative.is_absolute() or '..' in relative.parts or '\\' in name or not relative.parts:
        raise ValueError('Unsafe path: '+name)
    path=root.joinpath(*relative.parts)
    path.resolve().relative_to(root.resolve())
    cursor=path
    while cursor!=root:
        if cursor.is_symlink(): raise ValueError('Symlink destination: '+name)
        cursor=cursor.parent
    return path

def destination(name, live, web):
    if name.startswith('server/'): return safe(live,name[7:])
    if name.startswith('dist/'): return safe(web,name[5:])
    raise ValueError('Unexpected payload path: '+name)

def verify(package, live, web):
    manifest=json.loads((package/'MANIFEST.json').read_text())
    if manifest['version']!=1 or manifest['migrations'] is not False or manifest['restart']!=['mooncci-api','mooncci-worker']:
        raise ValueError('Unexpected release scope')
    modules=manifest['dependencies']
    for name,versions in modules.items():
        if not name.startswith('node_modules/') or any(name.startswith(other+'/') for other in modules if other!=name):
            raise ValueError('Unexpected dependency scope')
        current=safe(live,name)/'package.json'
        version=json.loads(current.read_text())['version'] if current.exists() else None
        if version not in [versions['before'],versions['after']]: raise ValueError('Dependency version drift: '+name)
    for name,expected in manifest['files'].items():
        allowed=name.startswith('dist/') or name in ['server/package.json','server/package-lock.json'] or name.startswith('server/runtime/') or any(name.startswith('server/'+module+'/') for module in modules)
        if not allowed or name.startswith('server/runtime/node_modules/') or name=='server/runtime/deployment.json':
            raise ValueError('Unexpected file scope: '+name)
        src=safe(package,name);destination(name,live,web)
        if not src.is_file() or digest(src)!=expected: raise ValueError('Payload checksum mismatch: '+name)
    for name,old in manifest['baseline'].items():
        if name not in ['package.json','package-lock.json']: raise ValueError('Unexpected baseline')
        if digest(safe(live,name)) not in [old,manifest['files']['server/'+name]]: raise ValueError('Production manifest drift: '+name)
    for required in ['dist/index.html','server/runtime/document.mjs','server/runtime/styles.json','server/runtime/home.css']:
        if required not in manifest['files']: raise ValueError('Missing payload: '+required)
    return manifest

def copy_file(source,target,owner):
    target.parent.mkdir(parents=True,exist_ok=True)
    temporary=target.with_name(target.name+'.security-new')
    if temporary.exists(): raise ValueError('Stale deployment file: '+str(temporary))
    shutil.copyfile(source,temporary);temporary.chmod(0o644)
    if os.name!='nt': os.chown(temporary,owner.st_uid,owner.st_gid)
    os.replace(temporary,target)

def restore(backup,live,web):
    state=json.loads((backup/'BEFORE.json').read_text())
    for record in state:
        if not record['existed']: continue
        saved=safe(backup/'before',record['name'])
        actual={p.relative_to(saved).as_posix():digest(p) for p in saved.rglob('*') if p.is_file()} if record['directory'] else digest(saved)
        if actual!=record['sha256']: raise ValueError('Backup checksum mismatch: '+record['name'])
    for record in reversed(state):
        target=destination(record['name'],live,web);saved=safe(backup/'before',record['name'])
        if record['directory']:
            if target.exists(): shutil.rmtree(target)
            if record['existed']: shutil.copytree(saved,target,copy_function=shutil.copy2)
        elif record['existed']:
            target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(saved,target)
        elif target.exists(): target.unlink()
        if record['existed'] and os.name!='nt':
            for path in [target]+(list(target.rglob('*')) if record['directory'] else []):
                os.chown(path,record['uid'],record['gid'])

def deploy(package,live,web,backup_root,restart,health):
    manifest=verify(package,live,web)
    backup_root.mkdir(parents=True,exist_ok=True)
    backup=pathlib.Path(tempfile.mkdtemp(prefix='mooncci-security-alerts-',dir=backup_root));backup.chmod(0o700)
    modules=['server/'+name for name in manifest['dependencies']]
    files=[name for name in manifest['files'] if not any(name.startswith(module+'/') for module in modules)]
    files.sort(key=lambda name:name=='dist/index.html')
    state=[]
    for name in modules+files:
        target=destination(name,live,web);saved=safe(backup/'before',name);existed=target.exists();directory=name in modules
        owner=target.stat() if existed else (live if name.startswith('server/') else web).stat()
        record={'name':name,'directory':directory,'existed':existed,'uid':getattr(owner,'st_uid',None),'gid':getattr(owner,'st_gid',None)}
        state.append(record)
        if existed:
            saved.parent.mkdir(parents=True,exist_ok=True)
            if directory: shutil.copytree(target,saved)
            else: shutil.copy2(target,saved)
            record['sha256']={p.relative_to(saved).as_posix():digest(p) for p in saved.rglob('*') if p.is_file()} if directory else digest(saved)
    (backup/'BEFORE.json').write_text(json.dumps(state)+'\n')
    shutil.copy2(package/'MANIFEST.json',backup/'MANIFEST.json')
    try:
        for record in state:
            name=record['name'];target=destination(name,live,web);source=safe(package,name)
            if record['directory']:
                temporary=target.with_name(target.name+'.security-new')
                if temporary.exists(): raise ValueError('Stale dependency stage')
                shutil.copytree(source,temporary)
                if os.name!='nt':
                    for path in [temporary]+list(temporary.rglob('*')):
                        os.chown(path,record['uid'],record['gid']);path.chmod(0o755 if path.is_dir() else 0o644)
                if target.exists(): shutil.rmtree(target)
                os.replace(temporary,target)
            else:
                copy_file(source,target,(live if name.startswith('server/') else web).stat())
        for name,expected in manifest['files'].items():
            if digest(destination(name,live,web))!=expected: raise ValueError('Installed checksum mismatch: '+name)
        restart();health()
    except BaseException:
        restore(backup,live,web)
        try: restart();health()
        except BaseException as error: raise RuntimeError('Rollback files restored but service recovery failed; backup '+str(backup)) from error
        print('Deployment failed; original scoped files restored. Backup: '+str(backup),file=sys.stderr)
        raise
    print('Deployment complete. Backup: '+str(backup))
    return backup

def restart():
    subprocess.run(['su','-s','/bin/bash','mooncci','-c','export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api mooncci-worker'],check=True)

def health():
    for _ in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3001/api/health',timeout=3) as response:
                if json.load(response).get('ok') is True: break
        except Exception: pass
        time.sleep(1)
    else: raise RuntimeError('API health check failed')
    subprocess.run(['/opt/mooncci-node-v24.20.0/bin/node','-e',"import('file:///www/wwwroot/mooncci-source/server/runtime/document.mjs').then(()=>console.log('Document runtime import OK'))"],check=True,timeout=30)

if __name__=='__main__':
    try:
        if os.geteuid()!=0: raise ValueError('Run as root')
        import fcntl
        live=pathlib.Path('/www/wwwroot/mooncci-source/server');web=pathlib.Path('/www/wwwroot/mooncci.site');backups=pathlib.Path('/www/backup')
        with (backups/'mooncci-deploy.lock').open('w') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            if len(sys.argv)>1:
                backup=pathlib.Path(sys.argv[1]).resolve(strict=True)
                if backup.parent!=backups or not backup.name.startswith('mooncci-security-alerts-'): raise ValueError('Unexpected backup location')
                manifest=json.loads((backup/'MANIFEST.json').read_text())
                for name,expected in manifest['files'].items():
                    if digest(destination(name,live,web))!=expected: raise ValueError('Subsequent changes detected; refusing rollback')
                restore(backup,live,web);restart();health();print('Rollback complete')
            else: deploy(pathlib.Path(__file__).resolve().parent,live,web,backups,restart,health)
    except Exception as error:
        print('Deployment stopped: '+str(error),file=sys.stderr);sys.exit(1)
