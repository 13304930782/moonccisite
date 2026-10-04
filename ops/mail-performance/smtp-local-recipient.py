#!/usr/bin/env python3
"""Explicit, disposable local-only SMTP benchmark recipient; no Postfix config changes."""
import contextlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

STATE = Path('/root/mooncci-smtp-benchmark-recipient.json')
PANEL = '/www/server/panel'
sys.path[:0] = [PANEL, PANEL + '/class', PANEL + '/plugin/mail_sys']
os.chdir(PANEL)

class Args(dict):
    def __getattr__(self, key):
        return self[key]

def main():
    action = sys.argv[1]
    if action not in ('create', 'inspect', 'disable'):
        raise ValueError('Invalid action')
    # Plugin diagnostics are not part of the safe benchmark output.
    with contextlib.redirect_stdout(io.StringIO()):
        from mail_sys_main import mail_sys_main
        plugin = mail_sys_main()
        if action == 'create':
            if STATE.exists():
                raise ValueError('Existing benchmark state requires review')
            address = 'codex-perf-' + secrets.token_hex(5) + '@mooncci.site'
            if plugin.M('mailbox').where('username=?', (address,)).count():
                raise ValueError('Mailbox already exists')
            fd = os.open(str(STATE), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, 'w') as out:
                json.dump({'address': address}, out)
            result = plugin.add_mailbox(Args(username=address, password='Aa9!' + secrets.token_hex(24),
                full_name='Disposable SMTP performance test', quota='1 GB', is_admin=0, active='1'))
            if result.get('status') is not True:
                raise ValueError('Creation needs review; do not retry')
        address = json.loads(STATE.read_text())['address']
        if not re.fullmatch(r'codex-perf-[0-9a-f]{10}@mooncci\.site', address):
            raise ValueError('Invalid test address')
        directory = Path('/www/vmail/mooncci.site') / address.split('@')[0]
        if directory.is_symlink() or not directory.is_dir():
            raise ValueError('Invalid test mailbox directory')
        if action == 'disable':
            plugin.M('mailbox').where('username=?', (address,)).setField('active', 0)
        row = plugin.M('mailbox').where('username=?', (address,)).field('active').find()
    alias = subprocess.check_output(['postmap', '-q', address, 'sqlite:/etc/postfix/btrule.cf'], universal_newlines=True).strip()
    if alias != address:
        raise ValueError('Recipient alias is not exclusively local')
    if any(directory.glob('*.sieve')) or (directory / '.dovecot.sieve').exists() or (directory / '.forward').exists():
        raise ValueError('Unexpected forwarding configuration')
    count = sum(1 for folder in ('new', 'cur') for p in (directory / folder).iterdir() if p.is_file())
    print(json.dumps({'address': address, 'active': str(row['active']) == '1', 'local_only': True, 'delivered_count': count}))

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'error': 'Local recipient setup needs review; no automatic retry'}))
        sys.exit(1)
