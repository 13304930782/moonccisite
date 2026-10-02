#!/usr/bin/env python3
"""Create one mailbox with the installed BaoTa mail_sys plugin. JSON enters on stdin."""
import json
import os
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
    if not isinstance(address, str) or not address.endswith('@mooncci.site'):
        raise ValueError('Unexpected mailbox domain')
    if not isinstance(password, str) or len(password) < 20:
        raise ValueError('Invalid generated password')

    from mail_sys_main import mail_sys_main
    plugin = mail_sys_main()
    # Never adopt or reset a pre-existing mailbox. It may belong to somebody else.
    if plugin.M('mailbox').where('username=?', (address,)).count():
        print(json.dumps({'created': False, 'reason': 'Mailbox already exists'}))
        return
    args = Args(username=address, password=password, full_name=address.split('@')[0],
                quota='1 GB', is_admin=0, active='1')
    result = plugin.add_mailbox(args)
    exists = bool(plugin.M('mailbox').where('username=?', (address,)).count())
    confirmed = result.get('status') is True and exists
    if confirmed:
        host = os.environ['MOONCCI_MAIL_HOST']
        with smtplib.SMTP_SSL(host, 465, timeout=12) as smtp:
            smtp.login(address, password)
    # An exception or a contradictory result requires manual review, never an
    # automatic retry with a different password.
    print(json.dumps({'created': confirmed,
                      'reason': 'Created and SMTP authenticated' if confirmed else 'Plugin result needs review'}))


if __name__ == '__main__':
    main()
