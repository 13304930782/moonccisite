"""Verify, install and restore only the reviewed experience release files."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile

LIVE = Path('/www/wwwroot/mooncci-source/server')
WEB = Path('/www/wwwroot/mooncci.site')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def target(name):
    if not re.fullmatch(r'[A-Za-z0-9_@+.,/-]+', name) or any(x in ('', '.', '..') for x in name.split('/')):
        raise ValueError('Unsafe path: '+name)
    if name.startswith('dist/'):
        root, rel = WEB, name[5:]
    elif name == 'server/src/routes/settings.js' or name.startswith('server/runtime/'):
        root, rel = LIVE, name[7:]
        if '/node_modules/' in name or name.endswith('/deployment.json'):
            raise ValueError('Protected runtime')
    else:
        raise ValueError('Outside release scope: '+name)
    path=root
    for part in rel.split('/'):
        path=path/part
        if path.is_symlink(): raise ValueError('Symlink in target: '+name)
    return path


def load(package):
    manifest=json.loads((package/'MANIFEST.json').read_text())
    baseline=json.loads((package/'BASELINE.json').read_text())
    if set(manifest['files']) != set(baseline): raise ValueError('Scope mismatch')
    for name, expected in manifest['files'].items():
        target(name)
        if digest(package/name)!=expected: raise ValueError('Package mismatch: '+name)
    return manifest,baseline


def replace(source, destination, server):
    missing=[]; p=destination.parent
    while not p.exists(): missing.append(p); p=p.parent
    if p.is_symlink(): raise ValueError('Symlink parent')
    owner=LIVE.stat()
    for directory in reversed(missing):
        directory.mkdir(mode=0o755); os.chmod(directory,0o755)
        if server: os.chown(directory,owner.st_uid,owner.st_gid)
    fd,tmp=tempfile.mkstemp(prefix='.experience-',dir=destination.parent)
    try:
        with os.fdopen(fd,'wb') as out, source.open('rb') as inp:
            shutil.copyfileobj(inp,out); out.flush(); os.fsync(out.fileno())
        os.chmod(tmp,0o644)
        if server: os.chown(tmp,owner.st_uid,owner.st_gid)
        os.replace(tmp,destination)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)


def snapshot(package, backup):
    manifest,baseline=load(package)
    for name,expected in baseline.items():
        if digest(target(name)) != expected: raise ValueError('Production drift: '+name)
    for name,expected in baseline.items():
        if expected is not None:
            dest=backup/'before'/name; dest.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(target(name),dest)
            if digest(dest)!=expected: raise ValueError('Backup mismatch: '+name)
    for name in ['BASELINE.json','MANIFEST.json','experience-preview-release.py','deploy-experience-preview.sh']:
        shutil.copyfile(package/name,backup/name)


def install(package):
    manifest,baseline=load(package)
    for name,expected in baseline.items():
        if digest(target(name)) != expected: raise ValueError('Production drift: '+name)
    names=sorted(manifest['files'],key=lambda n:n=='dist/index.html')
    for name in names:
        replace(package/name,target(name),name.startswith('server/'))
        if digest(target(name)) != manifest['files'][name]: raise ValueError('Install mismatch: '+name)


def restore(backup):
    baseline=json.loads((backup/'BASELINE.json').read_text())
    manifest=json.loads((backup/'MANIFEST.json').read_text())
    if set(manifest['files']) != set(baseline): raise ValueError('Scope mismatch')
    for name,expected in baseline.items():
        target(name)
        if digest(target(name)) not in (expected,manifest['files'][name]): raise ValueError('Rollback drift: '+name)
        if expected is not None and digest(backup/'before'/name)!=expected: raise ValueError('Backup mismatch: '+name)
    for name,expected in baseline.items():
        dest=target(name)
        if expected is None:
            if dest.exists(): dest.unlink()
        else: replace(backup/'before'/name,dest,name.startswith('server/'))


if __name__=='__main__':
    mode,path,*rest=sys.argv[1:]
    if mode=='snapshot': snapshot(Path(path),Path(rest[0]))
    elif mode=='install': install(Path(path))
    elif mode=='restore': restore(Path(path))
    elif mode=='verify':
        _,baseline=load(Path(path))
        for name,expected in baseline.items():
            if digest(target(name))!=expected: raise ValueError('Production drift: '+name)
    else: raise ValueError('Unknown operation')
    print('PASS:',mode)
