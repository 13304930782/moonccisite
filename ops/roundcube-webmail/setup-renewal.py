#!/usr/bin/env python3
"""Set up HTTP-01 renewal for the US webmail website only."""
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
import uuid

HOST = 'webmail.cuegroveapp.com'
WEBROOT = Path('/www/wwwroot') / HOST
TARGET = Path('/www/server/panel/vhost/cert') / HOST
NGINX = '/www/server/nginx/sbin/nginx'
HOOK = Path('/usr/local/sbin/renew-webmail-certificate.py')
LINEAGE = Path('/etc/letsencrypt/live') / HOST

DEPLOY = r"""#!/usr/bin/env python3
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

HOST = 'webmail.cuegroveapp.com'
SOURCE = Path('/etc/letsencrypt/live') / HOST
TARGET = Path('/www/server/panel/vhost/cert') / HOST
NGINX = '/www/server/nginx/sbin/nginx'

def run(*args):
    return subprocess.check_output(args, stderr=subprocess.STDOUT)

def atomic_copy(source, destination):
    fd, temp = tempfile.mkstemp(prefix='.renew-', dir=destination.parent)
    try:
        with os.fdopen(fd, 'wb') as out:
            out.write(source.read_bytes())
            out.flush()
            os.fsync(out.fileno())
        os.chmod(temp, 0o600 if destination.name == 'privkey.pem' else 0o644)
        os.replace(temp, destination)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)

def main():
    if os.environ.get('RENEWED_LINEAGE', str(SOURCE)) != str(SOURCE):
        return
    assert os.geteuid() == 0
    assert TARGET.is_dir() and not TARGET.is_symlink()
    cert = SOURCE / 'fullchain.pem'
    key = SOURCE / 'privkey.pem'
    run('openssl', 'x509', '-in', str(cert), '-noout', '-checkend', '86400')
    match = run('openssl', 'x509', '-in', str(cert), '-noout', '-checkhost', HOST)
    assert b'does match certificate' in match, 'Certificate hostname mismatch'
    certpub = run('openssl', 'x509', '-in', str(cert), '-pubkey', '-noout')
    keypub = run('openssl', 'pkey', '-in', str(key), '-pubout')
    assert certpub == keypub, 'Certificate and private key mismatch'
    run(NGINX, '-t')
    backup = Path(tempfile.mkdtemp(prefix='webmail-cert-' + time.strftime('%Y%m%d-'), dir='/www/backup'))
    for name in ('fullchain.pem', 'privkey.pem'):
        shutil.copy2(TARGET / name, backup / name)
        (backup / name).chmod(0o600)
    try:
        atomic_copy(key, TARGET / 'privkey.pem')
        atomic_copy(cert, TARGET / 'fullchain.pem')
        run(NGINX, '-t')
        run(NGINX, '-s', 'reload')
    except Exception:
        for name in ('fullchain.pem', 'privkey.pem'):
            atomic_copy(backup / name, TARGET / name)
        run(NGINX, '-t')
        run(NGINX, '-s', 'reload')
        raise
    print('PASS certificate deployed; Nginx reloaded; backup: ' + str(backup))

if __name__ == '__main__':
    main()
"""

def run(*args):
    print('+ ' + ' '.join(args), flush=True)
    subprocess.run(args, check=True)

def main():
    if os.geteuid() != 0 or socket.gethostname() not in ('mail', 'mail.cuegroveapp.com'):
        raise RuntimeError('Run as root on the US mail server')
    for name in ('fullchain.pem', 'privkey.pem'):
        if not (TARGET / name).is_file():
            raise RuntimeError('Expected BaoTa certificate missing')
    run(NGINX, '-t')
    # Prove that HTTP-01 reaches this precise directory without a redirect.
    challenge = WEBROOT / '.well-known/acme-challenge'
    challenge.mkdir(parents=True, exist_ok=True)
    probe = challenge / ('renew-check-' + uuid.uuid4().hex)
    body = uuid.uuid4().hex.encode()
    try:
        probe.write_bytes(body)
        probe.chmod(0o644)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        url = 'http://' + HOST + '/.well-known/acme-challenge/' + probe.name
        with opener.open(url, timeout=25) as result:
            if result.status != 200 or result.geturl() != url or result.read() != body:
                raise RuntimeError('HTTP challenge path did not return the probe directly')
    finally:
        probe.unlink(missing_ok=True)
    print('PASS public HTTP challenge path', flush=True)
    if not shutil.which('certbot'):
        run('apt-get', 'update')
        env = dict(os.environ, DEBIAN_FRONTEND='noninteractive', NEEDRESTART_MODE='l')
        subprocess.run(['apt-get', 'install', '-y', '--no-install-recommends', 'certbot'], env=env, check=True)
    certbot = shutil.which('certbot')
    if not certbot:
        raise RuntimeError('Certbot is unavailable after package installation')
    if HOOK.exists() and HOOK.read_bytes() != DEPLOY.encode():
        raise RuntimeError('An unrelated hook already exists at ' + str(HOOK))
    HOOK.write_bytes(DEPLOY.encode())
    HOOK.chmod(0o700)
    args = [certbot, 'certonly', '--webroot', '-w', str(WEBROOT),
            '-d', HOST, '--cert-name', HOST, '--non-interactive', '--agree-tos',
            '--register-unsafely-without-email',
            '--server', 'https://acme-v02.api.letsencrypt.org/directory']
    # Staging exercise cannot replace the live website certificate.
    run(*(args + ['--dry-run']))
    run(*(args + ['--keep-until-expiring', '--deploy-hook', str(HOOK)]))
    # Also deploy when an existing Certbot certificate was not yet due.
    run('python3', str(HOOK))
    renewal = Path('/etc/letsencrypt/renewal') / (HOST + '.conf')
    if not renewal.is_file() or str(HOOK) not in renewal.read_text():
        raise RuntimeError('Deploy hook was not saved in renewal configuration')
    run(certbot, 'renew', '--cert-name', HOST, '--dry-run', '--no-random-sleep-on-renew')
    run('systemctl', 'enable', '--now', 'certbot.timer')
    run('systemctl', 'is-active', 'certbot.timer')
    run('systemctl', 'list-timers', 'certbot.timer', '--no-pager')
    run('curl', '--noproxy', '*', '--fail', '--silent', '--show-error',
        '--max-time', '30', '--resolve', HOST + ':443:127.0.0.1',
        '-o', '/dev/null', 'https://' + HOST + '/')
    run('openssl', 'x509', '-in', str(TARGET / 'fullchain.pem'), '-noout', '-dates')
    print('PASS automatic renewal configured and dry-run passed', flush=True)
    print('Scope: webmail HTTPS only; mailbox IMAP/SMTP certificates unchanged.')

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('STOP: ' + str(exc), flush=True)
        raise SystemExit(1)
