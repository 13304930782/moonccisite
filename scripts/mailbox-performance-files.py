"""Scoped release file/config operations. Never prints existing environment values."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import sys

LIVE = Path('/www/wwwroot/mooncci-source/server')
KEYS = ('MAILBOX_TIMING_ENABLED', 'MAILBOX_TIMING_SAMPLE_RATE', 'MAILBOX_TIMING_MAX_PER_MINUTE',
        'MAILBOX_IMAP_POOL_ENABLED', 'MAILBOX_IMAP_POOL_API_PROCESSES', 'MAILBOX_IMAP_POOL_IDLE_MS')


def digest(data):
    return hashlib.sha256(data.replace(b'\r\n', b'\n')).hexdigest()


def atomic(target, data, uid, gid, mode):
    temporary = target.with_name(target.name + '.mail-perf-tmp')
    with temporary.open('wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.chown(temporary, uid, gid)
    os.chmod(temporary, mode)
    os.replace(temporary, target)


def config(values):
    target = LIVE / '.env'
    stat = target.stat()
    lines = target.read_text().splitlines()
    retained = [line for line in lines if line.split('=', 1)[0].strip() not in KEYS]
    retained.extend(f'{key}={value}' for key, value in values.items() if value is not None)
    atomic(target, ('\n'.join(retained) + '\n').encode(), stat.st_uid, stat.st_gid, stat.st_mode & 0o777)


def main():
    action, location = sys.argv[1:3]
    root = Path(location).resolve(strict=True)
    if action == 'mode':
        if str(root) != str(LIVE):
            raise ValueError('Unexpected live root')
        mode = sys.argv[3]
        if mode not in ('off', 'instrumentation', 'owner', 'owner-short'):
            raise ValueError('Invalid mode')
        config(dict(zip(KEYS, ('false' if mode == 'off' else 'true', '1', '60',
                               'true' if mode in ('owner', 'owner-short') else 'false', '1',
                               '300000' if mode == 'owner' else '30000'))))
        print('MODE=' + mode)
        return
    manifest = json.loads((root / 'FILES.json').read_text())
    user = pwd.getpwnam('mooncci')
    for relative, hashes in manifest.items():
        if relative.startswith('/') or '..' in Path(relative).parts or not relative.startswith('src/'):
            raise ValueError('Unsafe manifest')
        target = LIVE / relative
        actual = digest(target.read_bytes()) if target.exists() else None
        if actual not in (hashes['before'], hashes['after']):
            raise ValueError('Unreviewed production file: ' + relative)
    if action == 'preflight':
        print('PASS: all scoped files match reviewed baseline')
    elif action == 'backup':
        backup = Path(sys.argv[3]).resolve(strict=True)
        (backup / 'FILES.json').write_bytes((root / 'FILES.json').read_bytes())
        previous = {}
        for line in (LIVE / '.env').read_text().splitlines():
            key, sep, value = line.partition('=')
            if sep and key.strip() in KEYS:
                previous.setdefault(key.strip(), value)
        (backup / 'flags.json').write_text(json.dumps({key: previous.get(key) for key in KEYS}) + '\n')
        present = []
        for relative in manifest:
            target = LIVE / relative
            if target.exists():
                saved = backup / relative
                saved.parent.mkdir(parents=True, exist_ok=True)
                saved.write_bytes(target.read_bytes())
                present.append(relative)
        (backup / 'present.json').write_text(json.dumps(present) + '\n')
    elif action == 'install':
        for relative in manifest:
            data = (root / 'server' / relative).read_bytes()
            if digest(data) != manifest[relative]['after']:
                raise ValueError('Candidate checksum mismatch')
            atomic(LIVE / relative, data, user.pw_uid, user.pw_gid, 0o644)
    elif action == 'restore':
        if not str(root).startswith('/www/backup/mooncci-mail-perf.'):
            raise ValueError('Unexpected backup root')
        present = json.loads((root / 'present.json').read_text())
        for relative in manifest:
            target = LIVE / relative
            if relative in present:
                atomic(target, (root / relative).read_bytes(), user.pw_uid, user.pw_gid, 0o644)
            elif target.exists():
                target.unlink()
        config(json.loads((root / 'flags.json').read_text()))
    else:
        raise ValueError('Invalid action')


if __name__ == '__main__':
    main()
