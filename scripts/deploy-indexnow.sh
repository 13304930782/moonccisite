#!/usr/bin/env bash
# Run with nohup bash deploy.sh in a child shell; never source this file.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then printf 'Run this script in a child shell.\n' >&2; return 2; fi
set -Eeuo pipefail
umask 077
test "$(id -u)" = 0
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
cd "$package"
for tool in python3 systemctl flock sha256sum; do command -v "$tool" >/dev/null; done
sha256sum --strict -c SHA256SUMS
bash -n deploy.sh rollback.sh
/www/server/nginx/sbin/nginx -t
mkdir -p /www/backup
exec 9>/www/backup/mooncci-deploy.lock
flock -w 120 9
backup=$(mktemp -d "/www/backup/mooncci-indexnow.$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")
finish() {
  rc=$?; trap - EXIT; set +e
  if [ "$rc" -ne 0 ] && [ -f "$backup/CHANGED" ]; then
    MOONCCI_INDEXNOW_LOCK_HELD=1 bash "$backup/rollback.sh" "$backup" >> "$backup/rollback.log" 2>&1
    rollback_rc=$?
    printf 'ROLLBACK_EXIT_CODE=%s\n' "$rollback_rc"
    if [ "$rollback_rc" -ne 0 ]; then printf 'ROLLBACK NEEDS ATTENTION: %s/rollback.log\n' "$backup"; fi
  fi
  printf '%s\n' "$rc" > "$backup/exit-code"
  printf 'BACKUP=%s\nEXIT_CODE=%s\n' "$backup" "$rc"
  printf "ROLLBACK_COMMAND=nohup bash '%s/rollback.sh' '%s' > '%s/rollback.log' 2>&1 < /dev/null &\n" "$backup" "$backup" "$backup"
  exit "$rc"
}
trap finish EXIT
python3 - "$package" "$backup" <<'PY'
import fcntl, hashlib, json, os, pathlib, re, secrets, shutil, subprocess, sys, tempfile

package, backup = map(pathlib.Path, sys.argv[1:])
nginx = '/www/server/nginx/sbin/nginx'
extension = pathlib.Path('/www/server/panel/vhost/nginx/extension/mooncci.site')
expected_names = {'indexnow.py', 'deploy.sh', 'rollback.sh', 'mooncci-indexnow.service', 'mooncci-indexnow.timer', 'README.txt'}
manifest = json.loads((package / 'MANIFEST.json').read_text())
if (manifest.get('version') != 1 or manifest.get('component') != 'mooncci-indexnow'
        or set(manifest.get('files', {})) != expected_names
        or not re.fullmatch('[0-9a-f]{40}', manifest.get('revision', ''))
        or manifest.get('dependencies') is not False or manifest.get('migrations') is not False
        or manifest.get('restarts') != [] or manifest.get('timer_enabled') is not False
        or manifest.get('initial_submit') is not False):
    raise ValueError('Unexpected IndexNow package scope')
digest = lambda data: hashlib.sha256(data).hexdigest()
for name, expected in manifest['files'].items():
    data = (package / name).read_bytes()
    if b'\r' in data or digest(data) != expected:
        raise ValueError('Invalid package file: ' + name)
compile((package / 'indexnow.py').read_text(), 'indexnow.py', 'exec')
vhost = pathlib.Path('/www/server/panel/vhost/nginx/mooncci.site.conf')
if not re.search(r'^\s*include\s+/www/server/panel/vhost/nginx/extension/mooncci\.site/\*\.conf\s*;', vhost.read_text(), re.MULTILINE):
    raise ValueError('Existing mooncci.site extension include is missing')
if not extension.is_dir() or extension.resolve() != extension:
    raise ValueError('Unexpected Nginx extension directory')

def run(args):
    return subprocess.run(args, check=True)

def output(args):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
    return result.stdout.strip()

units = {}
for unit in ['mooncci-indexnow.timer', 'mooncci-indexnow.service']:
    load = output(['systemctl', 'show', '-p', 'LoadState', unit])
    if load == 'LoadState=not-found':
        units[unit] = {'enabled': 'not-found', 'active': 'inactive'}
        continue
    enabled, active = output(['systemctl', 'is-enabled', unit]), output(['systemctl', 'is-active', unit])
    if enabled not in ['enabled', 'enabled-runtime', 'disabled', 'static', 'indirect'] or active not in ['active', 'inactive', 'failed']:
        raise ValueError('Unsupported or changing unit state: ' + unit)
    units[unit] = {'enabled': enabled, 'active': active}

private = pathlib.Path('/var/lib/mooncci-indexnow')
public = pathlib.Path('/var/lib/mooncci-indexnow-public')
code = pathlib.Path('/opt/mooncci-indexnow')
for directory in [private, public, code]:
    if directory.resolve() != directory or (directory.exists() and (not directory.is_dir() or directory.stat().st_uid != 0)):
        raise ValueError('Unsafe IndexNow directory: ' + str(directory))
paths = [code / 'indexnow.py', code / 'MANIFEST.json',
         pathlib.Path('/etc/systemd/system/mooncci-indexnow.service'),
         pathlib.Path('/etc/systemd/system/mooncci-indexnow.timer'), extension / 'mooncci-indexnow.conf']
for path in paths:
    if path.resolve() != path or (path.exists() and not path.is_file()):
        raise ValueError('Unsafe deployment destination: ' + str(path))
key_path = private / 'key'
if key_path.is_symlink() or (key_path.exists() and (not key_path.is_file() or key_path.stat().st_uid != 0)):
    raise ValueError('Unsafe persistent key file')
if key_path.exists():
    key = key_path.read_text().strip()
    if not re.fullmatch('[0-9a-f]{64}', key):
        raise ValueError('Invalid persistent IndexNow key')
else:
    key = secrets.token_hex(32)
key_file = public / (key + '.txt')
if key_file.is_symlink() or (key_file.exists() and not key_file.is_file()):
    raise ValueError('Unsafe public key file')
if key_file.exists():
    if key_file.read_bytes().strip() != key.encode():
        raise ValueError('Existing public key contents differ')
configuration = ('# Persistent IndexNow key; main site only.\nlocation = /' + key + '.txt {\n'
                 '    alias /var/lib/mooncci-indexnow-public/' + key + '.txt;\n'
                 '    default_type text/plain;\n    charset utf-8;\n'
                 '    add_header Cache-Control "no-cache";\n}\n').encode()
payloads = [(package / 'indexnow.py').read_bytes(), (package / 'MANIFEST.json').read_bytes(),
            (package / 'mooncci-indexnow.service').read_bytes(), (package / 'mooncci-indexnow.timer').read_bytes(), configuration]
records = []
(backup / 'files').mkdir()
for index, (path, data) in enumerate(zip(paths, payloads)):
    record = {'path': str(path), 'installed_sha256': digest(data), 'existed': path.exists()}
    if path.exists():
        status = path.stat()
        record.update(sha256=digest(path.read_bytes()), mode=status.st_mode & 0o7777, uid=status.st_uid, gid=status.st_gid)
        shutil.copy2(str(path), str(backup / 'files' / str(index)))
    records.append(record)
(backup / 'BEFORE.json').write_text(json.dumps({'version': 1, 'files': records, 'units': units}, indent=2) + '\n')
shutil.copy2(str(package / 'rollback.sh'), str(backup / 'rollback.sh'))
shutil.copy2(str(vhost), str(backup / 'mooncci.site.conf.reference'))
(backup / 'mooncci.site.conf.reference').chmod(0o600)
saved = ['BEFORE.json', 'rollback.sh', 'mooncci.site.conf.reference'] + ['files/' + str(i) for i, row in enumerate(records) if row['existed']]
(backup / 'BACKUP_SHA256SUMS').write_text(''.join(digest((backup / name).read_bytes()) + '  ' + name + '\n' for name in saved))
subprocess.run(['sha256sum', '--strict', '-c', 'BACKUP_SHA256SUMS'], cwd=str(backup), check=True)

# Capture all originals before stopping units or replacing any managed file.
(backup / 'CHANGED').write_text('Scoped installation started.\n')
for unit in ['mooncci-indexnow.timer', 'mooncci-indexnow.service']:
    state = units[unit]
    if state['enabled'] != 'not-found':
        run(['systemctl', 'stop', unit])
        if state['enabled'] in ['enabled', 'enabled-runtime']:
            run(['systemctl', 'disable', unit])
private.mkdir(mode=0o700, exist_ok=True)
private.chmod(0o700)
runtime_lock = (private / 'lock').open('a+')
os.fchmod(runtime_lock.fileno(), 0o600)
fcntl.flock(runtime_lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
persistent = backup / 'persistent'
persistent.mkdir(mode=0o700)
for source, name in [(private / name, name) for name in ['key', 'state.json', 'lock']] + [(key_file, 'public-key.txt')]:
    if source.is_symlink() or (source.exists() and not source.is_file()):
        raise ValueError('Unsafe persistent IndexNow file: ' + str(source))
    if source.exists():
        shutil.copy2(str(source), str(persistent / name))
        (persistent / name).chmod(0o600)
names = sorted(path.name for path in persistent.iterdir())
(persistent / 'SHA256SUMS').write_text(''.join(digest((persistent / name).read_bytes()) + '  ' + name + '\n' for name in names))
subprocess.run(['sha256sum', '--strict', '-c', 'SHA256SUMS'], cwd=str(persistent), check=True)
if not key_path.exists():
    with key_path.open('x') as stream:
        stream.write(key + '\n')
key_path.chmod(0o600)
public.mkdir(mode=0o755, exist_ok=True)
public.chmod(0o755)
if not key_file.exists() or key_file.read_bytes() != key.encode():
    handle, temporary = tempfile.mkstemp(prefix='.indexnow-key-', dir=str(public))
    try:
        with os.fdopen(handle, 'wb') as stream:
            stream.write(key.encode())
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), 0o644)
        os.replace(temporary, str(key_file))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
key_file.chmod(0o644)
code.mkdir(mode=0o755, exist_ok=True)
for path, data in zip(paths, payloads):
    handle, temporary = tempfile.mkstemp(prefix='.mooncci-indexnow-', dir=str(path.parent))
    try:
        with os.fdopen(handle, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), 0o644)
        os.replace(temporary, str(path))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
run(['systemctl', 'daemon-reload'])
run(['systemctl', 'disable', 'mooncci-indexnow.timer'])
run([nginx, '-t'])
run([nginx, '-s', 'reload'])
for path, data in zip(paths, payloads):
    if path.read_bytes() != data:
        raise ValueError('Installed file verification failed: ' + str(path))
if output(['systemctl', 'is-enabled', 'mooncci-indexnow.timer']) != 'disabled' or output(['systemctl', 'is-active', 'mooncci-indexnow.timer']) == 'active':
    raise ValueError('IndexNow timer must remain disabled and inactive')
print('KEY_URL=https://moooncci.cn/' + key + '.txt', flush=True)
print('PASS: installed only IndexNow files and the exact main-site key location.', flush=True)
print('NO URLS SUBMITTED. Timer remains disabled. Verify KEY_URL, run indexnow.py run manually, then systemctl enable --now mooncci-indexnow.timer.', flush=True)
PY
