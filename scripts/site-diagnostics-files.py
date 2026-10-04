"""Strictly scoped install/restore, leaving environment and mail settings untouched."""
import hashlib, json, os, pwd, sys
from pathlib import Path
ROOTS={'api':Path('/www/wwwroot/mooncci-source'), 'reader':Path('/opt/mooncci-reader/current')}
ALLOWED={'api':{'server/src/index.js','server/src/lib/siteDiagnostics.js'},'reader':{'edge/reader/server.mjs'}}
def digest(data):return hashlib.sha256(data.replace(b'\r\n',b'\n')).hexdigest()
def atomic(target,data,scope):
    temp=target.with_name(target.name+'.diagnostic-tmp')
    temp.write_bytes(data);os.chmod(temp,0o644)
    if scope=='api':
        user=pwd.getpwnam('mooncci');os.chown(temp,user.pw_uid,user.pw_gid)
    os.replace(temp,target)
def main():
    action,location=sys.argv[1:3];package=Path(location).resolve(strict=True)
    manifest=json.loads((package/'FILES.json').read_text());scope=manifest['scope'];files=manifest['files']
    if scope not in ALLOWED or set(files)!=ALLOWED[scope]:raise ValueError('Unexpected scope')
    live=ROOTS[scope]
    if action=='restore':
        if not str(package).startswith('/www/backup/mooncci-site-diagnostics.'):raise ValueError('Unexpected backup')
        present=json.loads((package/'present.json').read_text())
        for name in files:
            if name in present:atomic(live/name,(package/name).read_bytes(),scope)
            elif (live/name).exists():(live/name).unlink()
        return
    for name,hashes in files.items():
        current=digest((live/name).read_bytes()) if (live/name).exists() else None
        if current not in (hashes['before'],hashes['after']):raise ValueError('Production drift: '+name)
        if digest((package/name).read_bytes())!=hashes['after']:raise ValueError('Candidate mismatch: '+name)
    if action=='backup':
        backup=Path(sys.argv[3]).resolve(strict=True);present=[]
        (backup/'FILES.json').write_bytes((package/'FILES.json').read_bytes())
        for name in files:
            if (live/name).exists():
                saved=backup/name;saved.parent.mkdir(parents=True,exist_ok=True);saved.write_bytes((live/name).read_bytes());present.append(name)
        (backup/'present.json').write_text(json.dumps(present)+'\n')
    elif action=='install':
        for name in files:atomic(live/name,(package/name).read_bytes(),scope)
    elif action!='preflight':raise ValueError('Unknown action')
    print('PASS: '+action+' '+scope)
if __name__=='__main__':main()
