"""Scoped release file/config operations. Never prints existing environment values."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import sys

LIVE = Path('/www/wwwroot/mooncci-source/server')
KEYS = ('MAILBOX_TIMING_ENABLED', 'MAILBOX_TIMING_SAMPLE_RATE', 'MAILBOX_TIMING_MAX_PER_MINUTE',
        'MAILBOX_IMAP_POOL_ENABLED', 'MAILBOX_IMAP_POOL_API_PROCESSES', 'MAILBOX_IMAP_POOL_IDLE_MS',
        'MAILBOX_SMTP_POOL_ENABLED', 'MAILBOX_SMTP_POOL_API_PROCESSES', 'MAILBOX_POOLS_ENABLED',
        'MAILBOX_POOL_ROLLOUT_PERCENT', 'MAILBOX_POOL_TEST_USER_IDS', 'MAILBOX_IMAP_POOL_GLOBAL_MAX',
        'MAILBOX_SMTP_POOL_GLOBAL_MAX')


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
    retained = [line for line in lines if line.split('=', 1)[0].strip() not in values]
    retained.extend(f'{key}={value}' for key, value in values.items() if value is not None)
    atomic(target, ('\n'.join(retained) + '\n').encode(), stat.st_uid, stat.st_gid, stat.st_mode & 0o777)


def main():
    action, location = sys.argv[1:3]
    root = Path(location).resolve(strict=True)
    if action == 'mode':
        if str(root) != str(LIVE):
            raise ValueError('Unexpected live root')
        mode = sys.argv[3]
        modes = ('off', 'instrumentation', 'owner', 'owner-short', 'owner-smtp', 'test', 'rollout25', 'rollout50', 'all', 'smtp-off', 'imap-off')
        if mode not in modes:
            raise ValueError('Invalid mode')
        if mode in ('smtp-off', 'imap-off'):
            config({'MAILBOX_SMTP_POOL_ENABLED' if mode == 'smtp-off' else 'MAILBOX_IMAP_POOL_ENABLED': 'false'})
        else:
            expanded = mode in ('test', 'rollout25', 'rollout50', 'all')
            values = dict(zip(KEYS[:8], ('false' if mode == 'off' else 'true', '1', '60',
                'true' if mode in ('owner', 'owner-short', 'owner-smtp') or expanded else 'false', '1',
                '30000' if mode == 'owner-short' else '300000',
                'true' if mode == 'owner-smtp' or expanded else 'false', '1')))
            values.update(MAILBOX_POOLS_ENABLED='false' if mode in ('off', 'instrumentation') else 'true',
                MAILBOX_POOL_ROLLOUT_PERCENT={'rollout25':'25','rollout50':'50','all':'100'}.get(mode,'0'),
                MAILBOX_IMAP_POOL_GLOBAL_MAX='6', MAILBOX_SMTP_POOL_GLOBAL_MAX='4')
            if mode == 'test':
                ids = sys.argv[4] if len(sys.argv) > 4 else ''
                if not ids or len(ids.split(',')) > 10 or not all(x.isdigit() and int(x)>0 for x in ids.split(',')):
                    raise ValueError('Provide explicit test user IDs')
                values['MAILBOX_POOL_TEST_USER_IDS'] = ids
            else:
                values['MAILBOX_POOL_TEST_USER_IDS'] = ''
            config(values)
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
