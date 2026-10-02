#!/usr/bin/env python3
"""Render a NEW test-only Nginx vhost; never install/reload it automatically."""
import argparse
import os
from pathlib import Path
import re

HOST='route-test.mooncci.site'

def render(region, cert, private_key, reader_key=None):
    for value in (cert, private_key):
        if not re.fullmatch(r'/[A-Za-z0-9_./-]+',value) or '..' in value.split('/'):
            raise ValueError('Use an absolute certificate path without whitespace or traversal')
    if region not in ('CN','US'):raise ValueError('Invalid region')
    if region=='US' and not re.fullmatch(r'[a-fA-F0-9]{64}',reader_key or ''):
        raise ValueError('Missing valid local reader key')
    proxy_headers="""
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_pass_request_headers off;
        proxy_set_header Host origin-cn.mooncci.site;
        proxy_set_header Accept "*/*";
        proxy_set_header User-Agent mooncci-geo-preview;
        proxy_cache off;
        proxy_next_upstream off;
        proxy_connect_timeout 3s;
        proxy_read_timeout 15s;
        proxy_hide_header Set-Cookie;
        proxy_hide_header Cache-Control;
        proxy_hide_header X-Mooncci-Node;
"""
    common="""
    if ($request_method !~ ^(GET|HEAD)$) { return 405; }
    if ($http_cookie != "") { return 403; }
    if ($http_authorization != "") { return 403; }
    if ($http_proxy_authorization != "") { return 403; }
    if ($http_upgrade != "") { return 403; }
    if ($http_range != "") { return 403; }
    client_max_body_size 1k;
    add_header Cache-Control "private, no-store" always;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header X-Content-Type-Options nosniff always;
"""
    if region=='US':
        locations='    location / {\n'+proxy_headers+'        proxy_set_header X-Mooncci-Reader-Key '+reader_key+';\n        proxy_pass http://127.0.0.1:3102;\n    }\n'
    else:
        locations=r"""
    root /www/wwwroot/mooncci.site;
    location = / { try_files /index.html =404; }
    location ~ ^/assets/[A-Za-z0-9_-]+\.(js|css|woff2?|png|jpe?g|webp|svg|gif|avif)$ { try_files $uri =404; }
    location ~ ^/api/posts(?:/[1-9][0-9]*(?:/related|/neighbors)?|/meta/(?:categories|tags)|/archives)?$ {
"""+proxy_headers+"""
        proxy_pass http://127.0.0.1:3001;
    }
    location / { return 403; }
"""
    # US private paths are also rejected by the reader allowlist; key stays server-side.
    return ('# TEST ONLY; no production auth/writes; generated file contains a node secret on US.\n'
        'server {\n    listen 80;\n    server_name '+HOST+';\n    return 301 https://'+HOST+'$request_uri;\n}\n'
        'server {\n    listen 443 ssl;\n    server_name '+HOST+';\n'
        '    ssl_certificate '+cert+';\n    ssl_certificate_key '+private_key+';\n'
        '    ssl_protocols TLSv1.2 TLSv1.3;\n'
        '    access_log /www/wwwlogs/mooncci-geo-preview-access.log;\n'
        '    error_log /www/wwwlogs/mooncci-geo-preview-error.log;\n'
        +common+'    add_header X-Mooncci-Node '+region+' always;\n'+locations+'}\n')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--region',required=True,choices=['CN','US'])
    parser.add_argument('--cert',required=True)
    parser.add_argument('--private-key',required=True)
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    for name in (args.cert,args.private_key):
        if not Path(name).is_file():raise SystemExit('Certificate file missing; stopped')
    key=None
    if args.region=='US':
        for line in Path('/etc/mooncci-reader.env').read_text().splitlines():
            if line.startswith('READER_KEY='):key=line.split('=',1)[1].strip().strip(chr(34)).strip(chr(39))
    data=render(args.region,args.cert,args.private_key,key).encode()
    fd=os.open(args.output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as stream:stream.write(data)
    print('Rendered test config; not installed or reloaded. Do not share its contents (US node key).')

if __name__=='__main__':main()
