#!/usr/bin/env python3
"""Encrypted backup runner. No repository creation, credentials or cron enabled implicitly."""
import argparse, datetime, hashlib, json, os, pathlib, re, shutil, subprocess, tempfile, urllib.request

def digest(file):
    h=hashlib.sha256()
    with open(file,'rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''): h.update(block)
    return h.hexdigest()

def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def secret_file(name):
    p = pathlib.Path(name).resolve(strict=True)
    if not p.is_file() or (os.name != 'nt' and p.stat().st_mode & 0o077):
        raise ValueError('Credential/config file must be owner-only')
    return p

def config(file):
    c = json.loads(secret_file(file).read_text(encoding='utf-8'))
    for key in ('work_dir', 'uploads', 'app_env', 'mysql_defaults', 'password_file', 'repository', 'database'):
        if not c.get(key): raise ValueError('Missing setting: ' + key)
    if not re.fullmatch(r'[A-Za-z0-9_]+', c['database']): raise ValueError('Invalid database name')
    work = pathlib.Path(c['work_dir']).resolve()
    if str(work) in ('/', '/tmp', '/var', '/www', '/www/backup'): raise ValueError('Use a dedicated backup work directory')
    for source in (pathlib.Path(c['uploads']).resolve(), pathlib.Path(c['app_env']).resolve().parent):
        if work == source or source in work.parents or work in source.parents:
            raise ValueError('Backup work directory must be separate from application data')
    if os.name != 'nt' and (str(work).startswith('/www/wwwroot/') or str(c['repository']).startswith('/www/wwwroot/')):
        raise ValueError('Backups must not be in the web root')
    for name in ('app_env','mysql_defaults','password_file'): secret_file(c[name])
    if not pathlib.Path(c['uploads']).is_dir(): raise ValueError('Uploads directory missing')
    return c

def notify(url):
    if not url: return
    from urllib.parse import urlparse
    u = urlparse(url)
    if u.scheme != 'https' or u.hostname != 'uptime.betterstack.com' or u.username or u.password or not u.path.startswith('/api/v1/heartbeat/'):
        raise ValueError('Invalid Better Stack heartbeat URL')
    # Reject redirects so a heartbeat credential is never forwarded elsewhere.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args): return None
    with urllib.request.build_opener(NoRedirect).open(url, timeout=10) as response:
        if response.status != 200: raise ValueError('Heartbeat failed')

def backup(c):
    work = pathlib.Path(c['work_dir']).resolve()
    work.mkdir(parents=True,exist_ok=True,mode=0o700)
    if os.name != 'nt' and work.stat().st_mode & 0o077: raise ValueError('Work directory must be owner-only')
    # OS flock releases even after a crash; the staging dir is never reused.
    import fcntl
    with (work/'backup.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        env = {**os.environ,'RESTIC_REPOSITORY':c['repository'],'RESTIC_PASSWORD_FILE':c['password_file']}
        restic = c.get('restic','restic')
        run([restic,'cat','config'],env=env,stdout=subprocess.DEVNULL)
        if shutil.disk_usage(work).free < int(c.get('min_free_bytes',1073741824)):
            raise ValueError('Insufficient staging space')
        with tempfile.TemporaryDirectory(prefix='snapshot-',dir=work) as temp:
            stage = pathlib.Path(temp)
            # Transaction-consistent database dump. Files remain live: this is explicitly recorded.
            with (stage/'database.sql').open('wb') as dump:
                run([c.get('mysqldump','mysqldump'),'--defaults-extra-file='+c['mysql_defaults'],'--single-transaction','--skip-lock-tables','--no-tablespaces','--set-gtid-purged=OFF','--hex-blob',c['database']],stdout=dump)
            if not (stage/'database.sql').stat().st_size: raise ValueError('Empty database dump')
            shutil.copyfile(c['app_env'],stage/'app.env')
            shutil.copytree(c['uploads'],stage/'uploads',symlinks=True)
            # Do not back up arbitrary files through upload symlinks.
            hashes={}
            for p in stage.rglob('*'):
                if p.is_symlink(): raise ValueError('Symlink in backup source')
                if p.is_file(): hashes[p.relative_to(stage).as_posix()]=digest(p)
            (stage/'MANIFEST.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'consistency':'transactional-database-live-files','files':hashes},indent=2)+'\n')
            run([restic,'backup','--tag','mooncci','--host',c.get('host_tag','mooncci-primary'),'--json','.'],cwd=stage,env=env)
        run([restic,'check'],env=env)
        # Grouping deliberately excludes random staging paths.
        run([restic,'forget','--tag','mooncci','--host',c.get('host_tag','mooncci-primary'),'--group-by','host,tags','--keep-daily','7','--keep-weekly','4','--keep-monthly','6','--prune'],env=env)
        notify(c.get('success_heartbeat'))
        print('Backup and repository check completed; retention applied.')

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--config',required=True);args=parser.parse_args()
    os.umask(0o077)
    try: backup(config(args.config))
    except Exception as error:
        # Subprocess arguments, repository URLs and exception messages may contain credentials.
        print('Backup failed: '+type(error).__name__,file=__import__('sys').stderr)
        raise SystemExit(1)
