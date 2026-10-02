#!/usr/bin/env python3
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


def write(path, content, mode=0o644):
    path.write_bytes(content.encode('utf-8'))
    path.chmod(mode)


def phpstr(value):
    return "'" + str(value).replace('\\', '\\\\').replace("'", "\\'") + "'"


def tls_name(port):
    for name in ('mx.mooncci.site', 'mail.cuegroveapp.com'):
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=8) as sock:
                with ssl.create_default_context().wrap_socket(sock, server_hostname=name):
                    return name
        except (OSError, ssl.SSLError):
            pass
    raise RuntimeError('Mail TLS certificate verification failed on port ' + str(port))


def extract(archive, destination):
    prefix = 'roundcubemail-' + VERSION
    with tarfile.open(archive) as tar:
        members = tar.getmembers()
        for member in members:
            parts = PurePosixPath(member.name).parts
            require(parts and parts[0] == prefix and '..' not in parts,
                    'Unsafe archive path')
            require(member.isdir() or member.isfile(), 'Unexpected archive member type')
        destination.mkdir(mode=0o755)
        for member in members:
            parts = PurePosixPath(member.name).parts[1:]
            if not parts:
                continue
            target = destination.joinpath(*parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                target.chmod(0o755)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(member) as src, target.open('wb') as dst:
                    shutil.copyfileobj(src, dst)
                target.chmod(0o644)


def nginx_config():
    return f'''# Scoped Roundcube webmail; previous vhost saved in /www/backup.
server {{
    listen 80;
    server_name {HOST};
    location ^~ /.well-known/acme-challenge/ {{ root {BASE}; }}
    location / {{ return 301 https://{HOST}$request_uri; }}
}}
server {{
    listen 443 ssl;
    server_name {HOST};
    ssl_certificate {CERT}/fullchain.pem;
    ssl_certificate_key {CERT}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    root {APP}/public_html;
    index index.php;
    client_max_body_size 25m;
    access_log off;
    error_log /www/wwwlogs/{HOST}.error.log;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header X-Content-Type-Options nosniff always;
    location = /installer.php {{ return 404; }}
    location ~ /\\. {{ return 404; }}
    location ~ ^/(config|SQL|logs|temp|vendor|roundcube-data)(/|$) {{ return 404; }}
    location = /favicon.ico {{ rewrite ^ /static.php/skins/elastic/images/favicon.ico last; }}
    location / {{ try_files $uri $uri/ =404; }}
    location ~ ^/(index|static)\\.php(/|$) {{
        fastcgi_split_path_info ^(.+?\\.php)(/.*)$;
        include /www/server/nginx/conf/fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $fastcgi_path_info;
        fastcgi_param HTTPS on;
        fastcgi_param PHP_ADMIN_VALUE "open_basedir={BASE}/:/tmp/:/etc/ssl/certs/:/usr/share/ca-certificates/\nmemory_limit=128M\nupload_max_filesize=20M\npost_max_size=25M\nsession.cookie_secure=1\nsession.cookie_httponly=1\ndisplay_errors=0";
        fastcgi_pass unix:/tmp/php-cgi-82.sock;
    }}
    location ~ \\.php {{ return 404; }}
}}
'''


def fetch(path):
    raw = subprocess.check_output(
        ['curl', '--noproxy', '*', '--silent', '--show-error', '--max-time', '30',
         '--resolve', HOST + ':443:127.0.0.1', '-w', '\\n%{http_code}',
         'https://' + HOST + path], stderr=subprocess.PIPE)
    body, code = raw.rsplit(b'\n', 1)
    return int(code), body.decode('utf-8', errors='replace')


def main():
    require(os.geteuid() == 0, 'Run on US server as root')
    require(socket.getfqdn() == 'mail.cuegroveapp.com' or
            socket.gethostname() in ('mail', 'mail.cuegroveapp.com'), 'Unexpected server hostname')
    archive = Path(__file__).resolve().parent / ('roundcubemail-' + VERSION + '-complete.tar.gz')
    require(hashlib.sha256(archive.read_bytes()).hexdigest() == SHA, 'Archive checksum mismatch')
    require(VHOST.is_file() and BASE.is_dir() and not BASE.is_symlink(), 'Create target BaoTa PHP site first')
    original = VHOST.read_bytes()
    names = re.findall(r'^\s*server_name\s+([^;]+);', original.decode(), re.M)
    require(names and all(n.split() == [HOST] for n in names), 'Vhost contains unexpected domains')
    require(not APP.exists() and not DATA.exists(), 'Roundcube directories already exist; refusing overwrite')
    require(shutil.disk_usage(BASE).free > 150 * 1024 * 1024, 'Need at least 150 MiB free disk space')
    require(Path('/tmp/php-cgi-82.sock').is_socket(), 'PHP 8.2 FPM socket missing')
    for filename in ('fullchain.pem', 'privkey.pem'):
        require((CERT / filename).is_file(), 'Missing webmail certificate')
    run('openssl', 'x509', '-in', str(CERT / 'fullchain.pem'), '-noout', '-checkend', '86400')
    check = run('openssl', 'x509', '-in', str(CERT / 'fullchain.pem'), '-noout', '-checkhost', HOST)
    require('does match certificate' in check, 'Certificate hostname mismatch')
    modules = json.loads(run(PHP, '-r', 'echo json_encode(get_loaded_extensions());'))
    missing = sorted(set(['mbstring', 'intl', 'dom', 'xml', 'openssl', 'fileinfo', 'curl', 'pdo_sqlite']) - set(modules))
    require(not missing, 'Install these BaoTa PHP 8.2 extensions first: ' + ', '.join(missing))
    imap, smtp = tls_name(993), tls_name(465)
    print('PASS preflight: PHP extensions, IMAP/SMTP TLS, webmail certificate', flush=True)
    run(NGINX, '-t')
    account = pwd.getpwnam('www')
    backup = Path('/www/backup') / ('roundcube-' + time.strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(parents=True, mode=0o700)
    shutil.copy2(VHOST, backup / 'vhost.conf')
    write(backup / 'rollback.sh', '#!/bin/bash\nset -eu\ncp -p ' + str(backup / 'vhost.conf') + ' ' + str(VHOST) + '\n' + NGINX + ' -t\n' + NGINX + ' -s reload\n', 0o700)
    extract(archive, APP)
    for folder in (DATA, DATA / 'temp', DATA / 'logs'):
        folder.mkdir(mode=0o700)
        os.chown(folder, account.pw_uid, account.pw_gid)
    db = DATA / 'roundcube.sqlite'
    with sqlite3.connect(db) as conn:
        conn.executescript((APP / 'SQL/sqlite.initial.sql').read_text())
        require(conn.execute('pragma integrity_check').fetchone()[0] == 'ok', 'SQLite integrity failure')
    db.chmod(0o600)
    os.chown(db, account.pw_uid, account.pw_gid)
    settings = {
        'db_dsnw': 'sqlite:///' + str(db) + '?mode=0600',
        'imap_host': 'ssl://127.0.0.1:993', 'smtp_host': 'ssl://127.0.0.1:465',
        'smtp_user': '%u', 'smtp_pass': '%p', 'des_key': secrets.token_hex(12),
        'product_name': 'Mooncci Webmail', 'skin': 'elastic', 'language': 'zh_CN',
        'temp_dir': str(DATA / 'temp'), 'log_dir': str(DATA / 'logs'),
        'session_samesite': 'Lax',
    }
    config = '<?php\n$config = [];\n' + ''.join("$config[" + phpstr(k) + '] = ' + phpstr(v) + ';\n' for k, v in settings.items())
    config += "$config['force_https'] = true;\n$config['enable_installer'] = false;\n$config['plugins'] = ['archive', 'zipdownload'];\n"
    for service, name in [('imap', imap), ('smtp', smtp)]:
        config += "$config['" + service + "_conn_options'] = ['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => " + phpstr(name) + "]];\n"
    configpath = APP / 'config/config.inc.php'
    write(configpath, config, 0o640)
    os.chown(configpath, 0, account.pw_gid)
    run(PHP, '-l', str(configpath))
    try:
        write(VHOST, nginx_config())
        run(NGINX, '-t')
        run(NGINX, '-s', 'reload')
        time.sleep(2)
        code, body = fetch('/')
        require(code == 200 and '_user' in body and '_pass' in body, 'Login page check failed; inspect Roundcube logs')
        code, _ = fetch('/static.php/skins/elastic/images/favicon.ico')
        require(code == 200, 'Static asset check failed')
        for path in ['/installer.php', '/config/config.inc.php', '/SQL/sqlite.initial.sql', '/roundcube-data/roundcube.sqlite', '/static.php/config/config.inc.php']:
            require(fetch(path)[0] in (403, 404), 'Private path protection failed: ' + path)
    except Exception:
        VHOST.write_bytes(original)
        run(NGINX, '-t')
        run(NGINX, '-s', 'reload')
        print('RESTORED original vhost. New Roundcube files retained for diagnosis.', flush=True)
        raise
    print('PASS: login page, static assets, private paths. No mailbox login or email sent.')
    print('URL: https://' + HOST)
    print('Rollback: bash ' + str(backup / 'rollback.sh'))
    print('Next: log in with an existing FULL email address and its mailbox password.')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('STOP:', str(exc), flush=True)
        raise SystemExit(1)
