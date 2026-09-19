#!/usr/bin/env python3
"""Manifest-scoped deployment. Invoke from a child shell; no dependency installs or SQL by default."""
import argparse, datetime, hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile, time, urllib.request

def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def safe(root,name):
    rel=pathlib.PurePosixPath(name)
    if rel.is_absolute() or '..' in rel.parts or not rel.parts or '\\' in name: raise ValueError('Unsafe manifest path')
    p=root.joinpath(*rel.parts)
    try:
        p.resolve().relative_to(root.resolve())
    except ValueError:
        raise ValueError('Path outside root')
    cursor=p
    while cursor!=root:
        if cursor.is_symlink(): raise ValueError('Symlink destination')
        cursor=cursor.parent
    return p

def validate(package,roots):
    manifest=json.loads((package/'MANIFEST.json').read_text())
    if manifest.get('version')!=1 or manifest.get('dependencies') or manifest.get('migrations'):
        raise ValueError('Unsupported manifest or dependency/migration change; use a reviewed migration package')
    seen=set()
    for row in manifest['files']:
        kind=row['kind']
        if kind not in roots: raise ValueError('Unknown component')
        name=row['path'];key=(kind,name)
        if key in seen: raise ValueError('Duplicate path')
        seen.add(key)
        if kind=='backend' and not name.startswith('src/'): raise ValueError('Backend scope must stay within src')
        src=safe(package/'payload'/kind,name);dst=safe(roots[kind],name)
        if not src.is_file() or digest(src)!=row['sha256']: raise ValueError('Payload checksum mismatch')
        actual=digest(dst) if dst.exists() else None
        if actual not in row['accepted'] and actual!=row['sha256']: raise ValueError('Unknown live changes: '+kind+'/'+name)
    if not seen: raise ValueError('Empty manifest')
    return manifest

def pm2():
    subprocess.run(['su','-s','/bin/bash','mooncci','-c','export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api mooncci-worker'],check=True)

def health():
    for _ in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3001/api/health',timeout=3) as r:
                if json.load(r).get('ok') is True:return
        except Exception: pass
        time.sleep(1)
    raise RuntimeError('API health check failed')

def main(package):
    if os.geteuid()!=0: raise ValueError('Run deployment as root')
    import fcntl
    roots={'backend':pathlib.Path('/www/wwwroot/mooncci-source/server'),'frontend':pathlib.Path('/www/wwwroot/mooncci.site')}
    backup_root=pathlib.Path('/www/backup');backup_root.mkdir(exist_ok=True)
    with (backup_root/'mooncci-deploy.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        manifest=validate(package,roots)
        backend=any(r['kind']=='backend' for r in manifest['files'])
        # This frontend includes revisions/bookmarks. Never deploy it over an unprepared backend.
        if manifest.get('requiredMigrations'):
            code="require('dotenv').config();const db=require('./src/db');db.query('SELECT filename FROM schema_migrations').then(([r])=>{const found=new Set(r.map(x=>x.filename));if(JSON.parse(process.argv[1]).some(x=>!found.has(x)))process.exitCode=1;}).finally(()=>db.end()).catch(()=>{process.exitCode=1;});"
            subprocess.run(['/opt/mooncci-node-v24.20.0/bin/node','-e',code,json.dumps(manifest['requiredMigrations'])],cwd=roots['backend'],check=True)
        backup=pathlib.Path(tempfile.mkdtemp(prefix='mooncci-manifest-',dir=backup_root));backup.chmod(0o700)
        entries=[]
        for row in manifest['files']:
            dst=safe(roots[row['kind']],row['path']); saved=safe(backup/row['kind'],row['path'])
            existed=dst.exists();entries.append((dst,saved,existed,row))
            if existed:saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(dst,saved)
        (backup/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
        (backup/'BEFORE.json').write_text(json.dumps([{'kind':r['kind'],'path':r['path'],'existed':e,'sha256':digest(saved) if e else None} for dst,saved,e,r in entries],indent=2)+'\n')
        changed=[]
        try:
            for dst,saved,existed,row in entries:
                changed.append((dst,saved,existed,row));dst.parent.mkdir(parents=True,exist_ok=True)
                tmp=dst.with_name(dst.name+'.mooncci-new')
                if tmp.exists():raise ValueError('Stale deployment temp file')
                shutil.copyfile(safe(package/'payload'/row['kind'],row['path']),tmp)
                tmp.chmod(0o644);shutil.chown(tmp,user='mooncci',group='mooncci');os.replace(tmp,dst)
            if backend:pm2();health()
            if (roots['frontend']/'index.html').is_file() and any(r['kind']=='frontend' for r in manifest['files']):
                expected=next(r['sha256'] for r in manifest['files'] if r['kind']=='frontend' and r['path']=='index.html')
                if digest(roots['frontend']/'index.html')!=expected:raise ValueError('Frontend switch failed')
            state=roots['backend']/'runtime';state.mkdir(mode=0o700,exist_ok=True);shutil.chown(state,user='mooncci',group='mooncci')
            tmp=state/'deployment.json.new';tmp.write_text(json.dumps({'revision':manifest['revision'],'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':'success','scope':'manifest-only'})+'\n');tmp.chmod(0o600);shutil.chown(tmp,user='mooncci',group='mooncci');os.replace(tmp,state/'deployment.json')
        except BaseException:
            for dst,saved,existed,row in reversed(changed):
                if existed:shutil.copy2(saved,dst);shutil.chown(dst,user='mooncci',group='mooncci')
                elif dst.exists():dst.unlink()
            if backend:pm2();health()
            print('Deployment failed; original scoped files restored. Backup: '+str(backup),file=sys.stderr)
            raise
        print('Deployment complete. Backup: '+str(backup))

if __name__=='__main__':
    try:main(pathlib.Path(__file__).resolve().parent)
    except Exception as error:print('Deployment stopped: '+str(error),file=sys.stderr);sys.exit(1)
