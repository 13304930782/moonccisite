#!/usr/bin/env bash
# Run with nohup bash rollback.sh BACKUP in a child shell; never source this file.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then printf 'Run this script in a child shell.\n' >&2; return 2; fi
set -Eeuo pipefail
umask 077
test "$(id -u)" = 0
backup=$(realpath -- "${1:?Pass the backup directory printed by deploy.sh}")
case "$backup" in /www/backup/mooncci-indexnow.*) ;; *) exit 2 ;; esac
if [ "${MOONCCI_INDEXNOW_LOCK_HELD:-0}" != 1 ]; then
  exec 9>/www/backup/mooncci-deploy.lock
  flock -w 120 9
fi
cd "$backup"
sha256sum --strict -c BACKUP_SHA256SUMS
python3 - "$backup" <<'PY'
import hashlib, json, os, pathlib, subprocess, sys, tempfile

backup = pathlib.Path(sys.argv[1])
if backup.parent != pathlib.Path('/www/backup') or not backup.name.startswith('mooncci-indexnow.'):
    raise ValueError('Unexpected backup directory')
before = json.loads((backup / 'BEFORE.json').read_text())
paths = ['/opt/mooncci-indexnow/indexnow.py', '/opt/mooncci-indexnow/MANIFEST.json',
         '/etc/systemd/system/mooncci-indexnow.service', '/etc/systemd/system/mooncci-indexnow.timer',
         '/www/server/panel/vhost/nginx/extension/mooncci.site/mooncci-indexnow.conf']
units = ['mooncci-indexnow.timer', 'mooncci-indexnow.service']
if before.get('version') != 1 or [row['path'] for row in before['files']] != paths or set(before['units']) != set(units):
    raise ValueError('Unexpected rollback scope')
digest = lambda data: hashlib.sha256(data).hexdigest()
for index, row in enumerate(before['files']):
    path = pathlib.Path(row['path'])
    if path.resolve() != path or (path.exists() and not path.is_file()):
        raise ValueError('Unsafe rollback destination: ' + str(path))
    actual = digest(path.read_bytes()) if path.exists() else None
    old = row['sha256'] if row['existed'] else None
    if actual not in [old, row['installed_sha256']]:
        raise ValueError('Subsequent changes detected: ' + str(path))
    if row['existed'] and digest((backup / 'files' / str(index)).read_bytes()) != old:
        raise ValueError('Original file checksum mismatch')

def run(args):
    subprocess.run(args, check=True)

for unit in units:
    status = subprocess.run(['systemctl', 'show', '-p', 'LoadState', unit], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
    if status.stdout.strip() != 'LoadState=not-found':
        run(['systemctl', 'stop', unit])
        if unit.endswith('.timer'):
            run(['systemctl', 'disable', unit])
for index, row in enumerate(before['files']):
    path = pathlib.Path(row['path'])
    if not row['existed']:
        if path.exists():
            path.unlink()
        continue
    handle, temporary = tempfile.mkstemp(prefix='.mooncci-indexnow-rollback-', dir=str(path.parent))
    try:
        with os.fdopen(handle, 'wb') as stream:
            stream.write((backup / 'files' / str(index)).read_bytes())
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), row['mode'])
            os.fchown(stream.fileno(), row['uid'], row['gid'])
        os.replace(temporary, str(path))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
run(['systemctl', 'daemon-reload'])
run(['/www/server/nginx/sbin/nginx', '-t'])
run(['/www/server/nginx/sbin/nginx', '-s', 'reload'])
for unit in reversed(units):
    state = before['units'][unit]
    if state['enabled'] in ['enabled', 'enabled-runtime']:
        args = ['systemctl', 'enable']
        if state['enabled'] == 'enabled-runtime':
            args.append('--runtime')
        run(args + [unit])
    elif state['enabled'] == 'disabled':
        run(['systemctl', 'disable', unit])
    if state['active'] == 'active':
        run(['systemctl', 'start', unit])
for row in before['files']:
    path = pathlib.Path(row['path'])
    if row['existed']:
        if not path.is_file() or digest(path.read_bytes()) != row['sha256']:
            raise ValueError('Restored file verification failed')
    elif path.exists():
        raise ValueError('New scoped file was not removed')
print('PASS: original IndexNow files, Nginx location and unit states restored. Persistent key/state retained; PM2, DB, sitemap and reader untouched.')
PY
