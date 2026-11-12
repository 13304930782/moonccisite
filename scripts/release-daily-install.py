#!/usr/bin/env python3
"""Install a manifest-scoped offline release; never replace .env, uploads or the migrator."""
import fcntl, hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile, time, urllib.request

PACKAGE = pathlib.Path(__file__).resolve().parent
SERVER = pathlib.Path('/www/wwwroot/mooncci-source/server')
WEB = pathlib.Path('/www/wwwroot/mooncci.site')
NODE = '/opt/mooncci-node-v24.20.0/bin/node'
BACKUP = pathlib.Path('/www/backup')
MIGRATIONS = {'202611120002_post_aside.sql', '202611120003_daily_questions.sql'}
BACKEND = {'src/index.js', 'src/lib/articlePublishing.js', 'src/lib/articleRevisions.js', 'src/lib/articleConflict.js', 'src/repositories/weatherMoodRepository.js', 'src/routes/articleDrafts.js', 'src/routes/posts.js', 'src/routes/weatherMood.js', 'src/lib/dailyQuestion.js', 'src/routes/dailyQuestions.js', 'src/routes/serviceTokens.js', 'src/routes/publishing.js', 'src/routes/contentTranslations.js', 'scripts/migrate-article-likes.js', 'scripts/migrate-post-aside.js', 'database/migrations/202611120002_post_aside.sql', 'database/migrations/202611120003_daily_questions.sql'}

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def target(name):
    p = pathlib.PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or '\\' in name: raise ValueError('Unsafe path')
    if name.startswith('dist/'):
        root, relative = WEB, name[5:]
    elif name.startswith('server/') and name[7:] in BACKEND:
        root, relative = SERVER, name[7:]
    elif name in ('server/runtime/document.mjs', 'server/runtime/home.css', 'server/runtime/styles.json') or name.startswith(('server/runtime/chunks/', 'server/runtime/assets/')):
        root, relative = SERVER, name[7:]
    else: raise ValueError('Outside reviewed scope: ' + name)
    dest = root.joinpath(*pathlib.PurePosixPath(relative).parts)
    cur = dest
    while cur != root:
        if cur.is_symlink(): raise ValueError('Symlink in target: ' + name)
        cur = cur.parent
    return dest

def pm2():
    subprocess.run(['su', '-s', '/bin/bash', 'mooncci', '-c', 'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 restart mooncci-api mooncci-worker'], check=True)

def health():
    for _ in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3001/api/health', timeout=3) as r:
                if json.load(r).get('ok') is True: return
        except Exception: pass
        time.sleep(1)
    raise RuntimeError('API health check failed')

def replace(src, dst, owned):
    dst.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.mooncci-release-', dir=dst.parent)
    try:
        with os.fdopen(fd, 'wb') as out, src.open('rb') as inp:
            shutil.copyfileobj(inp, out); out.flush(); os.fsync(out.fileno())
        os.chmod(name, 0o644)
        if owned: shutil.chown(name, user='mooncci', group='mooncci')
        os.replace(name, dst)
    finally:
        if os.path.exists(name): os.unlink(name)

def main():
    if os.geteuid() != 0: raise ValueError('Run as root')
    manifest = json.loads((PACKAGE / 'MANIFEST.json').read_text())
    baseline = json.loads((PACKAGE / 'BASELINE.json').read_text())
    files = manifest['files']
    if set(files) != set(baseline) or set(manifest['migrations']) != MIGRATIONS: raise ValueError('Manifest scope mismatch')
    if not {f'server/{x}' for x in BACKEND}.issubset(files) or 'dist/index.html' not in files: raise ValueError('Required files missing')
    for name, value in files.items():
        dest = target(name); src = PACKAGE / name
        if not src.is_file() or src.is_symlink() or sha(src) != value: raise ValueError('Package mismatch: ' + name)
        if (sha(dest) if dest.is_file() else None) != baseline[name]: raise ValueError('Production drift: ' + name)
    for name, digest in manifest['migrations'].items():
        if sha(PACKAGE / 'migrations' / name) != digest: raise ValueError('Migration mismatch')
    for name, digest in manifest['tools'].items():
        if sha(PACKAGE / name) != digest: raise ValueError('Tool mismatch')
    backup_root = BACKUP; backup_root.mkdir(exist_ok=True)
    with (backup_root / 'mooncci-deploy.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        for name in files:
            dest = target(name)
            if (sha(dest) if dest.is_file() else None) != baseline[name]: raise ValueError('Production changed: ' + name)
        backup = pathlib.Path(tempfile.mkdtemp(prefix='mooncci-daily-', dir=backup_root)); backup.chmod(0o700)
        (backup / 'BASELINE.json').write_text(json.dumps(baseline, indent=2) + '\n')
        (backup / 'MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n')
        for name in files:
            dest = target(name)
            if dest.is_file():
                saved = backup / 'files' / name; saved.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(dest, saved)
                if sha(saved) != baseline[name]: raise ValueError('Backup mismatch: ' + name)
        subprocess.run([NODE, str(PACKAGE / 'release-daily-backup.cjs'), str(backup / 'database.sql')], check=True)
        subprocess.run([NODE, str(PACKAGE / 'release-daily-migrate.cjs'), str(PACKAGE)], check=True)
        changed = []
        try:
            for name in sorted(files, key=lambda x: x == 'dist/index.html'):
                dest = target(name); changed.append(name)
                replace(PACKAGE / name, dest, name.startswith('server/'))
                if sha(dest) != files[name]: raise ValueError('Install mismatch: ' + name)
            pm2(); health()
        except BaseException:
            for name in reversed(changed):
                dest = target(name); saved = backup / 'files' / name
                if baseline[name] is None:
                    if dest.exists(): dest.unlink()
                else: replace(saved, dest, name.startswith('server/'))
            pm2(); health()
            print('Files restored; database changes retained. Backup:', backup)
            raise
        print('Deployment complete. Backup:', backup)

def rollback(backup):
    if os.geteuid() != 0: raise ValueError('Run as root')
    backup = pathlib.Path(backup).resolve()
    if backup.parent != BACKUP.resolve() or not backup.name.startswith('mooncci-daily-'): raise ValueError('Invalid backup directory')
    baseline = json.loads((backup / 'BASELINE.json').read_text())
    files = json.loads((backup / 'MANIFEST.json').read_text())['files']
    if set(files) != set(baseline): raise ValueError('Backup scope mismatch')
    with (BACKUP / 'mooncci-deploy.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        for name, previous in baseline.items():
            dest = target(name); current = sha(dest) if dest.is_file() else None
            if current not in (previous, files[name]): raise ValueError('Rollback blocked by later changes: ' + name)
            if previous is not None and sha(backup / 'files' / name) != previous: raise ValueError('Backup mismatch: ' + name)
        for name, previous in baseline.items():
            dest = target(name)
            if previous is None:
                if dest.exists(): dest.unlink()
            else: replace(backup / 'files' / name, dest, name.startswith('server/'))
        pm2(); health()
        print('Files restored; database, uploads and configuration retained. Backup:', backup)

if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--rollback': rollback(sys.argv[2])
    elif len(sys.argv) == 1: main()
    else: raise ValueError('Usage: release-daily-install.py [--rollback BACKUP]')
