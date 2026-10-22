#!/usr/bin/python3
"""Deploy renewed certificates to BaoTa's mail copies and Postfix's cached map."""
import fcntl
import os
from pathlib import Path
import subprocess


def run(*args):
    return subprocess.check_output(args, stderr=subprocess.PIPE)


def main():
    with open('/run/lock/mooncci-mail-certificates.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        pairs = [
            ('/www/server/panel/vhost/cert/mail.cuegroveapp.com', 'cuegroveapp.com', 'mail.cuegroveapp.com'),
            ('/etc/letsencrypt/live/mx.moooncci.cn', 'moooncci.cn', 'mx.moooncci.cn'),
        ]
        pending = []
        for source, domain, hostname in pairs:
            src = Path(source)
            dst = Path('/www/server/panel/plugin/mail_sys/cert') / domain
            cert, key = src / 'fullchain.pem', src / 'privkey.pem'
            if run('openssl', 'x509', '-in', str(cert), '-pubkey', '-noout') != run('openssl', 'pkey', '-in', str(key), '-pubout'):
                raise RuntimeError('Certificate/key mismatch: ' + domain)
            match = run('openssl', 'x509', '-in', str(cert), '-checkhost', hostname, '-noout')
            # OpenSSL on this host exits zero even when -checkhost does not match.
            if match.strip() != ('Hostname ' + hostname + ' does match certificate').encode():
                raise RuntimeError('Certificate hostname mismatch: ' + hostname)
            run('openssl', 'x509', '-in', str(cert), '-checkend', '86400', '-noout')
            for name in ('fullchain.pem', 'privkey.pem'):
                data = (src / name).read_bytes()
                if not (dst / name).exists() or (dst / name).read_bytes() != data:
                    pending.append((dst / name, data))
        marker = Path('/www/server/panel/plugin/mail_sys/cert/.mooncci-reload-pending')
        if not pending and not marker.exists():
            print('Certificates unchanged')
            return
        marker.touch(mode=0o600)
        for path, data in pending:
            temp = path.with_suffix('.sync-tmp')
            fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(data)
            os.replace(temp, path)
        run('postmap', '-F', 'hash:/etc/postfix/vmail_ssl.map')
        run('doveconf', '-n')
        run('systemctl', 'reload', 'postfix', 'dovecot')
        marker.unlink()
        print('Mail certificates synchronized')


if __name__ == '__main__':
    main()
