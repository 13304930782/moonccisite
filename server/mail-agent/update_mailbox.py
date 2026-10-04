#!/usr/bin/env python3
"""Update only one existing BaoTa mailbox password; JSON enters on stdin."""
from decimal import Decimal
import json
import os
import re
import smtplib
import sys

PANEL = '/www/server/panel'
PLUGIN = PANEL + '/plugin/mail_sys'
sys.path[:0] = [PANEL, PANEL + '/class', PLUGIN]
os.chdir(PANEL)


class Args(dict):
    def __getattr__(self, key):
        return self[key]


def main():
    job = json.load(sys.stdin)
    address = job['address']
    password = job['password']
    if not isinstance(address, str) or not re.fullmatch(r'[a-z][a-z0-9._-]{2,31}@mooncci\.site', address):
        raise ValueError('Unexpected mailbox address')
    if not isinstance(password, str) or not 12 <= len(password) <= 128 or not re.fullmatch(r'[!-~]+', password):
        raise ValueError('Invalid new password')
    if not all(re.search(pattern, password) for pattern in (r'[a-z]', r'[A-Z]', r'\d')):
        raise ValueError('Weak new password')

    from mail_sys_main import mail_sys_main
    plugin = mail_sys_main()
    row = plugin.M('mailbox').where('username=?', (address,)).find()
    if not row or str(row.get('active')) != '1':
        print(json.dumps({'changed': False, 'reason': 'Mailbox missing or disabled'}))
        return
    quota = str(Decimal(str(row['quota'])) / Decimal(1024 * 1024)) + ' MB'
    args = Args(username=address, password=password, full_name=row['full_name'],
                quota=quota, active=row['active'], is_admin=row['is_admin'])
    result = plugin.update_mailbox(args)
    if result.get('status') is not True:
        print(json.dumps({'changed': False, 'reason': 'Plugin update failed'}))
        return
    host = os.environ['MOONCCI_MAIL_HOST']
    with smtplib.SMTP_SSL(host, 465, timeout=12) as smtp:
        smtp.login(address, password)
    print(json.dumps({'changed': True}))


if __name__ == '__main__':
    main()
