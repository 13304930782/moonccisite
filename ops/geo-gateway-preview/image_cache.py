"""Bounded browser caching for anonymous public raster responses; no proxy cache."""
import re

VARIABLE = '$mooncci_raster_browser_cache'
VARY = 'add_header Vary "Cookie, Authorization, Proxy-Authorization, Range" always;'
LEGACY_BLOCK = '''# Mooncci anonymous raster browser cache: at most 60 seconds, never shared.
map "$request_method:$uri:$status:$http_cookie:$http_authorization:$http_proxy_authorization:$http_range:$upstream_http_set_cookie:$upstream_http_content_type:$upstream_http_cache_control" $mooncci_raster_browser_cache {
    default "private, no-store";
    "~^(GET|HEAD):/api/uploads/[A-Za-z0-9_-]+[.](png|jpg|jpeg|gif|webp|avif):200::::::image/(png|jpeg|gif|webp|avif):public,[ ]*max-age=0$" "private, max-age=60, must-revalidate";
}
'''
BLOCK = LEGACY_BLOCK.replace('\n}\n', '\n    "~^(GET|HEAD):/api/uploads/[A-Za-z0-9_-]+[.](png|jpg|jpeg|gif|webp|avif):304::::::(image/(png|jpeg|gif|webp|avif))?:public,[ ]*max-age=0$" "private, max-age=60, must-revalidate";\n}\n')


def patch(text):
    if text.startswith(BLOCK):
        raise ValueError('Image cache revalidation patch already present')
    if VARIABLE in text:
        if not text.startswith(LEGACY_BLOCK):
            raise ValueError('Unrecognized existing image cache map')
        base = text[len(LEGACY_BLOCK):]
        if VARY in base:
            if base.count('\n    ' + VARY) != 2:
                raise ValueError('Unexpected credential partition directives')
            base = base.replace('\n    ' + VARY, '')
        existing = 'add_header Cache-Control ' + VARIABLE + ' always;'
        if base.count(existing) != 2:
            raise ValueError('Expected two existing cache header groups')
        base = base.replace(existing, 'add_header Cache-Control "private, no-store" always;')
        return patch(base)
    if VARY in text:
        raise ValueError('Unexpected credential partition without cache map')
    if 'upstream mooncci_cn_tls_pool {' not in text:
        raise ValueError('Expected existing gateway connection pool')
    for directive in ['proxy_ssl_verify on;', 'proxy_next_upstream off;',
                      'proxy_pass https://mooncci_cn_tls_pool;']:
        if text.count(directive) != (4 if directive == 'proxy_next_upstream off;' else 2):
            raise ValueError('Unexpected gateway configuration: ' + directive)
    pattern = r'add_header Cache-Control "private, no-store" always;(?=\s*add_header X-Content-Type-Options nosniff always;\s*add_header X-Mooncci-Node US always;\s*add_header X-Mooncci-Route primary always;)'
    updated, count = re.subn(pattern, 'add_header Cache-Control ' + VARIABLE + ' always;\n    ' + VARY, text)
    if count != 2:
        raise ValueError('Expected exactly two primary response header groups')
    return BLOCK + updated
