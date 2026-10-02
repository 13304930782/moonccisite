#!/usr/bin/env python3
"""Read-only deployed reader acceptance. Secrets are prompted, never logged."""
import argparse
import getpass
import hashlib
import json
import re
import statistics
import time
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

BASE = 'https://mooncci.site'
POSTS = '/api/posts?format=paged&page=1&pageSize=1'

def valid_asset_type(path, content_type, body):
    """Accept known JS MIME aliases and optional UTF-8, never HTML or other charsets."""
    parts = (content_type or '').lower().split(';')
    allowed = {'text/javascript', 'application/javascript'} if path.endswith('.js') else {'text/css'} if path.endswith('.css') else set()
    if parts[0].strip() not in allowed:
        return False
    seen = set()
    for parameter in parts[1:]:
        name, separator, value = parameter.strip().partition('=')
        if not separator or name.strip() != 'charset' or name.strip() in seen:
            return False
        seen.add(name.strip())
        if value.strip().strip('"').strip() not in ('utf-8', 'utf8'):
            return False
    try:
        body.decode('utf-8', errors='strict')
    except UnicodeDecodeError:
        return False
    return True

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--region', choices=['US', 'CN'], default='US')
    parser.add_argument('--timing-only', action='store_true', help='Only compare five timing rounds')
    args = parser.parse_args()
    key = getpass.getpass('PREVIEW_KEY (hidden): ').strip()
    if not key:
        raise SystemExit('Empty key; stopped')
    opener = build_opener(NoRedirect())
    failures = []
    def fetch(path, preview=True, extra=None, direct=False):
        headers = {'User-Agent': 'Mozilla/5.0 (compatible; MooncciAcceptance/1.0)', 'Accept': '*/*'}
        if preview and not direct:
            headers['X-Mooncci-Preview'] = key
        headers.update(extra or {})
        start = time.monotonic()
        try:
            response = opener.open(Request(('https://origin-cn.mooncci.site' if direct else BASE) + path, headers=headers), timeout=25)
        except HTTPError as error:
            response = error
        with response:
            body = response.read(16 * 1024 * 1024 + 1)
            if len(body) > 16 * 1024 * 1024:
                raise RuntimeError('response-size-limit')
            return response.status, response.headers, body, time.monotonic() - start
    def check(label, response, route, status=200, reason=None):
        code, headers, body, elapsed = response
        valid = (code == status and headers.get('X-Mooncci-Route') == route
                 and headers.get('X-Mooncci-Router-Version') == 'preview-diag-1'
                 and 'no-store' in headers.get('Cache-Control', ''))
        if reason:
            valid = valid and headers.get('X-Mooncci-Reason') == reason
        if not valid:
            failures.append(label)
        print(('PASS' if valid else 'FAIL'), label, 'HTTP=' + str(code),
              'route=' + str(headers.get('X-Mooncci-Route')),
              'reason=' + str(headers.get('X-Mooncci-Reason')),
              'seconds=' + str(round(elapsed, 3)), flush=True)
    target = 'reader' if args.region == 'US' else 'primary'
    public_reason = 'reader-response' if args.region == 'US' else 'domestic-region'
    if not args.timing_only:
        public = fetch(POSTS)
        check('public-posts', public, target, reason=public_reason)
        try:
            json.loads(public[2])
        except (ValueError, UnicodeError):
            failures.append('posts-json')
            print('FAIL posts-json')
        for label, extra in [('cookie-isolation', {'Cookie': 'mooncci_acceptance=1'}),
                             ('authorization-isolation', {'Authorization': 'Bearer deliberately-invalid-acceptance-token'})]:
            result = fetch(POSTS, extra=extra)
            # Some origins reject invalid credentials; routing must still be primary.
            status = result[0] if result[0] in (200, 401, 403) else 200
            check(label, result, 'primary', status, 'not-public-read')
        check('login-providers-route', fetch('/api/auth/providers'), 'primary', reason='not-public-read')
        check('account-page-route', fetch('/account/bookmarks'), 'primary', reason='not-public-read')
        if args.region == 'US':
            check('wrong-preview-key', fetch(POSTS, extra={'X-Mooncci-Preview': 'invalid-acceptance-key'}),
                  'primary', reason='preview-key-mismatch')
        home = fetch('/')
        check('homepage', home, target, reason=public_reason)
        assets = list(dict.fromkeys(re.findall(r"(?:src|href)=[\"'](/assets/[A-Za-z0-9_-]+\.(?:js|css))[\"']", home[2].decode('utf-8', errors='replace'))))[:3]
        if not assets:
            failures.append('homepage-assets-discovery')
            print('FAIL homepage-assets-discovery')
        for asset in assets:
            routed = fetch(asset)
            check('asset ' + asset, routed, target, reason=public_reason)
            primary = fetch(asset, extra={'Cookie': 'mooncci_acceptance=1'})
            check('asset-primary ' + asset, primary, 'primary', reason='not-public-read')
            same_bytes = routed[2] == primary[2]
            same_type = all(valid_asset_type(asset, result[1].get('Content-Type'), result[2]) for result in (routed, primary))
            print(('PASS' if same_bytes else 'FAIL'), 'asset-bytes-equality', asset)
            for label, result in [('reader', routed), ('primary', primary)]:
                print('ASSET_DETAIL', label, asset,
                      'bytes=' + str(len(result[2])),
                      'sha256=' + hashlib.sha256(result[2]).hexdigest(),
                      'content-type=' + repr(result[1].get('Content-Type')),
                      'content-encoding=' + repr(result[1].get('Content-Encoding')), flush=True)
            print(('PASS' if same_type else 'FAIL'), 'asset-content-type-validity', asset)
            if not same_bytes or not same_type:
                failures.append('asset-content-equality ' + asset)
    timings = {'primary': [], 'preview': []}
    if args.region == 'CN':
        timings['origin-direct'] = []
    for index in range(5):
        labels = list(timings)
        if index % 2:
            labels.reverse()
        for label in labels:
            try:
                result = fetch(POSTS, preview=label == 'preview', direct=label == 'origin-direct')
            except (OSError, RuntimeError) as error:
                failures.append('timing-' + label + '-' + str(index + 1))
                print('FAIL TIMING', label, 'round=' + str(index + 1), 'error=' + type(error).__name__, flush=True)
                time.sleep(0.3)
                continue
            print('SAMPLE', label, 'round=' + str(index + 1), 'HTTP=' + str(result[0]), 'seconds=' + str(round(result[3], 3)), flush=True)
            if label == 'preview':
                check('timing-preview-' + str(index + 1), result, target, reason=public_reason)
            if result[0] == 200:
                timings[label].append(result[3])
            else:
                failures.append('timing-' + label)
            time.sleep(0.3)
    for label, values in timings.items():
        if values:
            print('TIMING', label, 'successful-samples=' + str(len(values)) + '/5',
                  'median=' + str(round(statistics.median(values), 3)),
                  'max=' + str(round(max(values), 3)))
    print('RESULT', 'PASS' if not failures else 'FAIL', 'failures=' + str(len(failures)))
    print('LIMIT: read-only checks; no real OAuth login, outage drill or account quota verification.')
    raise SystemExit(1 if failures else 0)

if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError) as error:
        print('ERROR', type(error).__name__, 'network or size check failed; no secrets printed')
        raise SystemExit(2)
