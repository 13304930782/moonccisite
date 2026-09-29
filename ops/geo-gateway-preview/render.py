"""US formal-host gateway for directed acceptance. Authentication and writes stay on the primary."""
import re
HOST='mooncci.site'

def render(region, cert, private_key, reader_key=None, ca_bundle='/etc/ssl/certs/ca-certificates.crt'):
    for path in (cert,private_key,ca_bundle):
        if not re.fullmatch(r'/[A-Za-z0-9_./-]+',path) or '..' in path.split('/'):
            raise ValueError('Invalid TLS path')
    if region not in ('CN','US'):raise ValueError('Invalid region')
    if region=='US' and not re.fullmatch(r'[a-fA-F0-9]{64}',reader_key or ''):raise ValueError('Invalid reader key')
    def headers(route):
        return '''
        add_header Cache-Control "private, no-store" always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-Mooncci-Node REGION always;
        add_header X-Mooncci-Route ROUTE always;
'''.replace('REGION',region).replace('ROUTE',route)
    primary='''
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host mooncci.site;
        proxy_set_header X-Forwarded-Host mooncci.site;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Forwarded "";
        proxy_set_header Proxy-Authorization "";
        proxy_set_header X-Mooncci-Reader-Key "";
        proxy_set_header X-Mooncci-Preview "";
        proxy_set_header X-Mooncci-Public-Host "";
        proxy_ssl_server_name on;
        proxy_ssl_name mooncci.site;
        proxy_ssl_verify on;
        proxy_ssl_verify_depth 5;
        proxy_ssl_trusted_certificate CA_BUNDLE;
        proxy_next_upstream off;
        proxy_cache off;
        proxy_intercept_errors off;
        proxy_redirect off;
        proxy_hide_header Alt-Svc;
        proxy_hide_header Cache-Control;
        proxy_hide_header X-Mooncci-Node;
        proxy_hide_header X-Mooncci-Route;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_pass https://182.92.179.81;
'''.replace('CA_BUNDLE',ca_bundle)
    select=''
    reader=''
    if region=='US':
        select=r'''
        set $mooncci_geo_public 0;
        if ($request_uri ~ "^/(?:|articles|archives|about|links|projects|updates|tags|categories|rss|article/[1-9][0-9]*|assets/[A-Za-z0-9_-]+\.(?:js|css|woff2?|png|jpe?g|webp|svg|gif|avif))$") { set $mooncci_geo_public 1; }
        if ($request_method !~ ^(GET|HEAD)$) { set $mooncci_geo_public 0; }
        if ($http_cookie != "") { set $mooncci_geo_public 0; }
        if ($http_authorization != "") { set $mooncci_geo_public 0; }
        if ($http_proxy_authorization != "") { set $mooncci_geo_public 0; }
        if ($http_range != "") { set $mooncci_geo_public 0; }
        error_page 418 = @mooncci_reader;
        if ($mooncci_geo_public = 1) { return 418; }
'''
        reader='''
    location @mooncci_reader {
        proxy_http_version 1.1;
        proxy_pass_request_headers off;
        proxy_set_header Connection "";
        proxy_set_header Host reader-origin.mooncci.site;
        proxy_set_header X-Mooncci-Reader-Key READER_KEY;
        proxy_set_header Accept "*/*";
        proxy_set_header User-Agent mooncci-geo-gateway;
        proxy_pass http://127.0.0.1:3102;
        proxy_cache off;
        proxy_next_upstream off;
        proxy_connect_timeout 2s;
        proxy_read_timeout 12s;
        proxy_hide_header Set-Cookie;
        proxy_hide_header Alt-Svc;
        proxy_hide_header Cache-Control;
        proxy_hide_header X-Mooncci-Node;
        proxy_hide_header X-Mooncci-Route;
        proxy_intercept_errors on;
        error_page 401 403 500 502 503 504 = @mooncci_primary;
'''.replace('READER_KEY',reader_key)+headers('reader')+'    }\n'
        asset_reader=reader.replace('location @mooncci_reader', 'location @mooncci_asset_reader').replace('error_page 401', 'error_page 404 401')
        reader+=asset_reader
        select=select.replace('error_page 418 = @mooncci_reader;', 'error_page 418 = @mooncci_reader;\n        error_page 419 = @mooncci_asset_reader;\n        set $mooncci_geo_asset $mooncci_geo_public;\n        if ($uri !~ ^/assets/) { set $mooncci_geo_asset 0; }\n        if ($mooncci_geo_asset = 1) { return 419; }')
    return ('# US gateway; DNS remains unchanged until acceptance.\n'
        'server { listen 80; server_name '+HOST+'; return 301 https://'+HOST+'$request_uri; }\n'
        'server {\n    listen 443 ssl;\n    server_name '+HOST+';\n'
        '    ssl_certificate '+cert+';\n    ssl_certificate_key '+private_key+';\n'
        '    ssl_protocols TLSv1.2 TLSv1.3;\n    client_max_body_size 10m;\n'
        '    access_log off;\n    error_log /www/wwwlogs/mooncci-geo-gateway-error.log warn;\n'
        '    recursive_error_pages on;\n'
        '    if ($http_upgrade != "") { return 400; }\n'
        '    location / {\n'+select+primary+headers('primary')+'    }\n'+reader+
        '    location @mooncci_primary {\n'+primary+headers('primary')+'    }\n}\n')
