"""Scoped offline Roundcube installation for the US BaoTa server."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import re
import secrets
import shutil
import socket
import sqlite3
import ssl
import subprocess
import tarfile
import time
HOST = 'webmail.cuegroveapp.com'
VERSION = '1.7.4'
SHA = '2c6c878f0093f1bf7fb6086781d2dd9269d652c016b86939c157c5f1729139a2'
BASE = Path('/www/wwwroot') / HOST
APP = BASE / ('roundcube-' + VERSION)
DATA = BASE / 'roundcube-data'
VHOST = Path('/www/server/panel/vhost/nginx') / (HOST + '.conf')
CERT = Path('/www/server/panel/vhost/cert') / HOST
PHP = '/www/server/php/82/bin/php'
NGINX = '/www/server/nginx/sbin/nginx'

def run(*args):
    return subprocess.check_output(args, stderr=subprocess.STDOUT, text=True).strip()

def require(ok, message):
    if not ok:
        raise RuntimeError(message)

def write(path, content, mode=420):
    path.write_bytes(content.encode('utf-8'))
    path.chmod(mode)

def nginx_config():
    return f'# Scoped Roundcube webmail; previous vhost saved in /www/backup.\nserver {{\n    listen 80;\n    server_name {HOST};\n    location ^~ /.well-known/acme-challenge/ {{ root {BASE}; }}\n    location / {{ return 301 https://{HOST}$request_uri; }}\n}}\nserver {{\n    listen 443 ssl;\n    server_name {HOST};\n    ssl_certificate {CERT}/fullchain.pem;\n    ssl_certificate_key {CERT}/privkey.pem;\n    ssl_protocols TLSv1.2 TLSv1.3;\n    root {APP}/public_html;\n    index index.php;\n    client_max_body_size 25m;\n    access_log off;\n    error_log /www/wwwlogs/{HOST}.error.log;\n    add_header X-Robots-Tag "noindex, nofollow" always;\n    add_header X-Content-Type-Options nosniff always;\n    location = /installer.php {{ return 404; }}\n    location ~ /\\. {{ return 404; }}\n    location ~ ^/(config|SQL|logs|temp|vendor|roundcube-data)(/|$) {{ return 404; }}\n    location = /favicon.ico {{ rewrite ^ /static.php/skins/elastic/images/favicon.ico last; }}\n    location / {{ try_files $uri $uri/ =404; }}\n    location ~ ^/(index|static)\\.php(/|$) {{\n        fastcgi_split_path_info ^(.+?\\.php)(/.*)$;\n        include /www/server/nginx/conf/fastcgi_params;\n        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;\n        fastcgi_param PATH_INFO $fastcgi_path_info;\n        fastcgi_param HTTPS on;\n        fastcgi_param PHP_ADMIN_VALUE "open_basedir={BASE}/:/tmp/:/etc/ssl/certs/:/usr/share/ca-certificates/\nmemory_limit=128M\nupload_max_filesize=20M\npost_max_size=25M\nsession.cookie_secure=1\nsession.cookie_httponly=1\ndisplay_errors=0";\n        fastcgi_pass unix:/tmp/php-cgi-82.sock;\n    }}\n    location ~ \\.php {{ return 404; }}\n}}\n'

def fetch(path):
    raw = subprocess.check_output(['curl', '--noproxy', '*', '--silent', '--show-error', '--max-time', '30', '--resolve', HOST + ':443:127.0.0.1', '-w', '\\n%{http_code}', 'https://' + HOST + path], stderr=subprocess.PIPE)
    body, code = raw.rsplit(b'\n', 1)
    return (int(code), body.decode('utf-8', errors='replace'))

def recover():
    require(os.geteuid() == 0, 'Run as root on the US server')
    require(socket.gethostname() in ('mail', 'mail.cuegroveapp.com') or socket.getfqdn() == 'mail.cuegroveapp.com', 'Unexpected server')
    for path in [APP / 'public_html/index.php', APP / 'config/config.inc.php', DATA / 'roundcube.sqlite', VHOST]:
        require(path.is_file(), 'Expected installed file missing: ' + str(path))
    require(not BASE.is_symlink() and not VHOST.is_symlink(), 'Unexpected symbolic link')
    original = VHOST.read_bytes()
    names = re.findall(r'^\s*server_name\s+([^;]+);', original.decode(), re.M)
    require(names and all(n.split() == [HOST] for n in names), 'Unexpected vhost domains')
    run(NGINX, '-t')
    backup = Path('/www/backup') / ('roundcube-recovery-' + time.strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(mode=0o700)
    shutil.copy2(VHOST, backup / 'vhost.conf')
    print('Saved vhost backup: ' + str(backup), flush=True)
    try:
        write(VHOST, nginx_config())
        run(NGINX, '-t')
        run(NGINX, '-s', 'reload')
        time.sleep(2)
        code, body = fetch('/')
        require(code == 200 and '_user' in body and '_pass' in body, 'Login page validation failed')
        require(fetch('/static.php/skins/elastic/images/favicon.ico')[0] == 200, 'Icon validation failed')
        for path in ['/installer.php', '/config/config.inc.php', '/SQL/sqlite.initial.sql', '/roundcube-data/roundcube.sqlite', '/static.php/config/config.inc.php']:
            require(fetch(path)[0] in (403, 404), 'Private path validation failed: ' + path)
    except Exception:
        VHOST.write_bytes(original)
        run(NGINX, '-t')
        run(NGINX, '-s', 'reload')
        print('RESTORED original vhost', flush=True)
        raise
    print('PASS: login page, binary icon, private paths')
    print('https://' + HOST)
    print('Existing application configuration, database and mailboxes preserved.')

if __name__ == '__main__':
    try:
        recover()
    except Exception as exc:
        print('STOP:', str(exc), flush=True)
        raise SystemExit(1)
