#!/usr/bin/env python3
"""Independent IndexNow queue for the existing, published-only sitemap (Python 3.6+)."""
import argparse
from contextlib import contextmanager
import datetime as dt
from html.parser import HTMLParser
import http.client
import hashlib
import stat
import importlib.util
import json
import itertools
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET

ORIGIN = 'https://moooncci.cn'
ADMIN_DIR = Path(os.environ.get('MOONCCI_INDEXNOW_ADMIN_DIR', '/var/lib/mooncci-indexnow-admin'))
ENDPOINT = 'https://api.indexnow.org/indexnow'
STATE_DIR = Path('/var/lib/mooncci-indexnow')
SITEMAP = Path('/www/wwwroot/mooncci.site/sitemap-pages.xml')
VALIDATOR = Path('/opt/mooncci-sitemap/refresh-sitemap.py')
NS = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
STATIC = {'/', '/articles', '/archives', '/about', '/links', '/projects', '/updates',
          '/tags', '/categories', '/rss', '/series', '/early-access', '/mail-setup'}
BATCH_SIZE = 100


def public_url(value):
    if not isinstance(value, str) or len(value) > 2048 or any(ord(char) > 127 for char in value):
        raise ValueError('Invalid public URL')
    parsed = urllib.parse.urlsplit(value)
    if (parsed.scheme != 'https' or parsed.netloc != urllib.parse.urlsplit(ORIGIN).netloc or parsed.query
            or parsed.fragment or value != ORIGIN + parsed.path):
        raise ValueError('Only canonical HTTPS moooncci.cn URLs without parameters are allowed')
    path = parsed.path
    if path in STATIC or re.fullmatch(r'/(article|updates)/[1-9][0-9]*', path):
        return value
    if re.fullmatch(r'/article/[^/]+', path):
        part = path.rsplit('/', 1)[1]
        decoded = urllib.parse.unquote(part, errors='strict')
        if (0 < len(decoded) <= 255 and not decoded.isdigit() and decoded not in ('.', '..')
                and not re.search(r'[/\\#?\x00-\x1f\x7f]', decoded)
                and urllib.parse.quote(decoded, safe="~!*'()-._") == part):
            return value
    if re.fullmatch(r'/projects/[a-zA-Z0-9_-]+', path):
        return value
    if re.fullmatch(r'/(category|tag|series)/[^/]+', path):
        part = path.rsplit('/', 1)[1]
        decoded = urllib.parse.unquote(part, errors='strict')
        if (0 < len(decoded) <= 100 and decoded not in ('.', '..')
                and not re.search(r'[/#?\x00-\x1f\x7f]', decoded)
                and urllib.parse.quote(decoded, safe="~!*'()-._") == part):
            return value
    raise ValueError('URL is outside the public sitemap routes')


def lastmod(value):
    if value is None:
        return None
    if not re.fullmatch(r'\d{4}-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d))?', value):
        raise ValueError('Invalid real sitemap lastmod')
    stamp = value
    if len(value) == 10:
        stamp += 'T00:00:00+0000'
    else:
        stamp = stamp.replace('Z', '+0000')
        stamp = re.sub(r'([+-]\d\d):(\d\d)$', r'\1\2', stamp)
    pattern = '%Y-%m-%dT%H:%M:%S' + ('.%f' if '.' in stamp else '') + '%z'
    parsed = dt.datetime.strptime(stamp, pattern).astimezone(dt.timezone.utc)
    if parsed.timestamp() > time.time() + 300:
        raise ValueError('Sitemap lastmod is in the future')
    return parsed.isoformat()


def snapshot(data):
    if len(data) > 10 * 1024 * 1024:
        raise ValueError('Oversized sitemap')
    spec = importlib.util.spec_from_file_location('mooncci_existing_sitemap', str(VALIDATOR))
    existing = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(existing)
    existing.validate(data)
    result = {}
    for row in ET.fromstring(data):
        url = public_url(row.find(NS + 'loc').text)
        dates = row.findall(NS + 'lastmod')
        if len(dates) > 1 or (dates and not dates[0].text):
            raise ValueError('Invalid sitemap lastmod')
        result[url] = lastmod(dates[0].text if dates else None)
    return result


def fresh_sitemap():
    # Unchanged XML retains its mtime; freshness comes from the existing refresher's success.
    raw = subprocess.check_output(['systemctl', 'show', 'mooncci-sitemap.service',
                                  '-p', 'Result', '-p', 'ExecMainStatus',
                                  '-p', 'ExecMainExitTimestampMonotonic'],
                                 timeout=5, universal_newlines=True)
    info = dict(line.split('=', 1) for line in raw.splitlines() if '=' in line)
    age = time.monotonic() - int(info.get('ExecMainExitTimestampMonotonic') or 0) / 1000000
    if info.get('Result') != 'success' or info.get('ExecMainStatus') != '0' or not 0 <= age <= 900:
        raise ValueError('Sitemap refresher failed or last success is older than 15 minutes')
    with SITEMAP.open('rb') as source:
        return snapshot(source.read(10 * 1024 * 1024 + 1))


@contextmanager
def exclusive(path):
    with open(str(path), 'a+b') as handle:
        if os.name == 'nt':
            import msvcrt
            handle.seek(0, os.SEEK_END)
            if handle.tell() == 0:
                handle.write(b'\0')
                handle.flush()
            handle.seek(0)
            try:
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError:
                raise BlockingIOError('IndexNow is already running')
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == 'nt':
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


def load_state(path):
    if not path.exists():
        return {'version': 1, 'seen': {}, 'pending': {}, 'receipts': [], 'failures': 0,
                'next_attempt': 0, 'blocked': None}
    state = json.loads(path.read_text(encoding='utf-8'))
    if (state.get('version') != 1 or not isinstance(state.get('seen'), dict)
            or not isinstance(state.get('pending'), dict) or not isinstance(state.get('receipts'), list)):
        raise ValueError('Invalid persisted state; refusing to reset the submission history')
    for url in list(state['seen']) + list(state['pending']):
        public_url(url)
    for item in state['pending'].values():
        if item.get('kind') not in ('change', 'remove'):
            raise ValueError('Invalid pending submission')
    return state


def save_state(path, state, mode=0o600, group=None):
    handle, temporary = tempfile.mkstemp(prefix='.indexnow-', dir=str(path.parent))
    try:
        with os.fdopen(handle, 'w', encoding='utf-8', newline='\n') as output:
            json.dump(state, output, ensure_ascii=True, sort_keys=True, indent=2)
            output.write('\n')
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, mode)
        if group is not None and os.name != 'nt':
            os.chown(temporary, -1, group)
        os.replace(temporary, str(path))
        if os.name != 'nt':
            directory = os.open(str(path.parent), os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def reconcile(state, current, now):
    for url, modified in current.items():
        if url not in state['seen'] or (modified is not None and modified != state['seen'][url]):
            state['pending'][url] = {'kind': 'change', 'lastmod': modified, 'queued_at': now}
        elif url in state['pending'] and state['pending'][url]['kind'] == 'remove':
            del state['pending'][url]
    for url in state['seen'].keys() - current.keys():
        state['pending'][url] = {'kind': 'remove', 'lastmod': state['seen'][url], 'queued_at': now}
    state['seen'] = current
    state['last_valid_sitemap_at'] = now


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, newurl):
        return None


def request(url, data=None):
    headers = {'User-Agent': 'mooncci-indexnow/1.0', 'Cache-Control': 'no-cache'}
    if data is not None:
        headers['Content-Type'] = 'application/json; charset=utf-8'
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        try:
            response = urllib.request.build_opener(NoRedirect).open(req, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.code, response.headers, response.read(512 * 1024 + 1)
    except http.client.HTTPException as error:
        raise OSError('Incomplete or invalid HTTP response: ' + str(error))


class Metadata(HTMLParser):
    def __init__(self):
        HTMLParser.__init__(self)
        self.noindex = False
        self.canonical = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta' and attrs.get('name', '').lower() in ('robots', 'bingbot'):
            self.noindex |= bool(re.search(r'\b(noindex|none)\b', attrs.get('content', ''), re.I))
        if tag == 'link' and 'canonical' in attrs.get('rel', '').lower().split():
            self.canonical = attrs.get('href')


def page_status(url):
    try:
        code, headers, body = request(url)
        if code in (404, 410):
            return 'gone'
        if code != 200 or 'text/html' not in headers.get('Content-Type', ''):
            return 'unknown'
        meta = Metadata()
        meta.feed(body.decode('utf-8', errors='replace'))
        if meta.noindex or re.search(r'\b(noindex|none)\b', headers.get('X-Robots-Tag', ''), re.I):
            return 'gone'
        if meta.canonical != url or b'id="root"' not in body:
            return 'unknown'
        return 'public'
    except (OSError, ValueError):
        return 'unknown'


def robots_policy():
    code, _, body = request(ORIGIN + '/robots.txt')
    if code != 200 or b'<html' in body.lower() or b'user-agent:' not in body.lower():
        raise ValueError('Cannot verify public robots.txt policy')
    policy = urllib.robotparser.RobotFileParser()
    policy.parse(body.decode('utf-8').splitlines())
    return policy


def retry_delay(headers, now, failures):
    value = headers.get('Retry-After', '')
    delay = min(86400, 600 * 2 ** min(failures - 1, 8))
    if value.isdigit():
        return max(delay, int(value))
    if value:
        import email.utils
        try:
            return max(delay, email.utils.parsedate_to_datetime(value).timestamp() - now)
        except (TypeError, ValueError):
            pass
    return delay


def flush(state, path, key, policy, now):
    if state.get('blocked') or now < state.get('next_attempt', 0):
        return {'event': 'deferred', 'pending': len(state['pending']),
                'blocked': state.get('blocked'), 'next_attempt': state.get('next_attempt')}
    ready = []
    deadline = time.monotonic() + 120
    for url, item in sorted(state['pending'].items(),
                            key=lambda entry: (entry[1].get('last_checked', 0), entry[1]['queued_at'])):
        if len(ready) >= BATCH_SIZE or time.monotonic() >= deadline:
            break
        status = page_status(url)
        item['last_checked'] = now
        if item['kind'] == 'remove':
            if status == 'gone':
                ready.append(url)
        elif status == 'public' and policy.can_fetch('bingbot', url):
            ready.append(url)
        # A temporary outage or a still-public URL absent from XML cannot imply deletion.
    if not ready:
        save_state(path, state)
        return {'event': 'no_submission', 'pending': len(state['pending'])}
    payload = json.dumps({'host': urllib.parse.urlsplit(ORIGIN).netloc, 'key': key,
                          'keyLocation': ORIGIN + '/' + key + '.txt', 'urlList': ready}).encode('utf-8')
    try:
        code, headers, body = request(ENDPOINT, payload)
    except (OSError, ValueError) as error:
        code, headers, body = 0, {}, str(error).encode('utf-8')
    receipt = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'count': len(ready), 'http': code, 'urls': ready, 'endpoint': ENDPOINT}
    if code in (200, 202):
        for url in ready:
            del state['pending'][url]
        state.update(failures=0, next_attempt=0)
        receipt['result'] = 'submitted' if code == 200 else 'accepted_key_verification_pending'
    else:
        state['failures'] = state.get('failures', 0) + 1
        receipt['reason'] = body.decode('utf-8', errors='replace').replace(key, '[redacted]')[:500]
        if 400 <= code < 500 and code != 429:
            state['blocked'] = {'http': code, 'reason': receipt['reason'], 'action': 'Fix cause, then run retry'}
            receipt['result'] = 'blocked_operator_action_required'
        else:
            state['next_attempt'] = now + retry_delay(headers, now, state['failures'])
            receipt['result'] = 'retry_scheduled'
    state['receipts'] = (state['receipts'] + [receipt])[-20:]
    save_state(path, state)
    return dict(receipt, pending=len(state['pending']))


def iso_time(value):
    return dt.datetime.fromtimestamp(value, dt.timezone.utc).isoformat() if value else None


def export_status(state, ok=True):
    if not ADMIN_DIR.is_dir():
        return
    status = {'version': 1, 'checkedAt': iso_time(time.time()), 'origin': ORIGIN, 'endpoint': ENDPOINT,
              'lastRun': {'ok': ok, 'error': None if ok else 'Run failed; inspect service journal'},
              'lastValidSitemapAt': iso_time(state.get('last_valid_sitemap_at')),
              'pendingCount': len(state.get('pending', {})),
              'pendingUrls': [{'url': public_url(url), 'kind': item['kind']}
                              for url, item in itertools.islice(state.get('pending', {}).items(), 100)],
              'blocked': state.get('blocked'),
              'nextRetryAt': iso_time(state.get('next_attempt')),
              'receipts': state.get('receipts', [])[-20:],
              'requests': [{k: v for k, v in row.items() if k != 'identity'}
                           for row in state.get('admin_requests', [])[-100:]]}
    save_state(ADMIN_DIR / 'status.json', status, 0o640, ADMIN_DIR.stat().st_gid)


def consume_requests(state, current, now, path):
    inbox = ADMIN_DIR / 'requests'
    if not inbox.is_dir() or inbox.is_symlink():
        return
    for entry in itertools.islice(inbox.iterdir(), 100):
        if not re.fullmatch(r'[a-f0-9]{64}\.json', entry.name):
            continue
        handle = None
        try:
            info = entry.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_size > 16384:
                continue
            handle = os.open(str(entry), os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0))
            opened = os.fstat(handle)
            if not stat.S_ISREG(opened.st_mode) or (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                continue
            with os.fdopen(handle, 'rb') as source:
                handle = None
                raw = source.read(16385)
            if len(raw) > 16384:
                continue
            identity = hashlib.sha256(raw).hexdigest()
            previous = state.setdefault('admin_requests', [])
            if not any(row.get('identity') == identity for row in previous):
                row = {'identity': identity, 'state': 'rejected', 'reason': 'Invalid request'}
                try:
                    data = json.loads(raw.decode('utf-8'))
                    if not isinstance(data, dict) or data.get('version') != 1:
                        raise ValueError('Invalid schema')
                    url = public_url(data.get('url'))
                    if hashlib.sha256(url.encode('utf-8')).hexdigest() + '.json' != entry.name:
                        raise ValueError('Invalid filename')
                    action = data.get('action', 'submit')
                    requested = data.get('requestedAt')
                    stamp = re.sub(r'([+-]\d\d):(\d\d)$', r'\1\2', requested.replace('Z', '+0000'))
                    parsed = dt.datetime.strptime(stamp, '%Y-%m-%dT%H:%M:%S' + ('.%f' if '.' in stamp else '') + '%z').timestamp()
                    actor = data.get('actorId')
                    if type(actor) is not int or actor < 1 or action not in ('submit', 'retry'):
                        raise ValueError('Invalid actor/action')
                    row.update(url=url, requestedAt=requested, actorId=actor, action=action)
                    if not 0 <= now - parsed <= 86400 or url not in current:
                        raise ValueError('Expired or unavailable URL')
                    if action == 'retry':
                        if url not in state['pending'] or now - state.get('last_admin_retry', 0) < 900:
                            raise ValueError('Retry requires pending URL and 15 minute cooldown')
                        state.update(blocked=None, next_attempt=0, last_admin_retry=now)
                    state['pending'].setdefault(url, {'kind': 'change', 'lastmod': current[url], 'queued_at': now})
                    row.update(state='queued', reason=None)
                except (ValueError, TypeError, AttributeError, OverflowError):
                    row['reason'] = 'Invalid, expired or unavailable public URL; retry requires pending work and 15 minute cooldown'
                state['admin_requests'] = (previous + [row])[-100:]
                # Persist intent and consumed identity before removing the file or sending.
                save_state(path, state)
            latest = entry.lstat()
            if stat.S_ISREG(latest.st_mode) and (latest.st_dev, latest.st_ino) == (info.st_dev, info.st_ino):
                entry.unlink()
        except (OSError, ValueError):
            continue
        finally:
            if handle is not None:
                os.close(handle)


def run(command, urls=()):
    with exclusive(STATE_DIR / 'lock'):
        path = STATE_DIR / 'state.json'
        state = load_state(path)
        if command == 'status':
            return {'seen': len(state['seen']), 'pending': len(state['pending']),
                    'blocked': state.get('blocked'), 'next_attempt': state.get('next_attempt'),
                    'receipts': state['receipts']}
        key = (STATE_DIR / 'key').read_text(encoding='utf-8').strip()
        if not re.fullmatch(r'[a-f0-9]{32,128}', key):
            raise ValueError('Invalid persisted IndexNow key')
        current = fresh_sitemap()
        policy = robots_policy()
        now = time.time()
        for url in urls:
            public_url(url)
            if url not in current and url not in state['seen'] and url not in state['pending']:
                raise ValueError('Manual URL is not in the current or previously public sitemap')
        reconcile(state, current, now)
        consume_requests(state, current, now, path)
        for url in set(urls):
            state['pending'][url] = {'kind': 'change' if url in current else 'remove',
                                     'lastmod': current.get(url), 'queued_at': now}
        if command == 'retry':
            state.update(blocked=None, next_attempt=0)
        # Persist intent before I/O: a timeout or process restart cannot lose queued URLs.
        save_state(path, state)
        result = flush(state, path, key, policy, now)
        export_status(state)
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['run', 'submit', 'retry', 'status'])
    parser.add_argument('urls', nargs='*')
    args = parser.parse_args()
    if (args.command == 'submit') != bool(args.urls):
        parser.error('submit requires public URL arguments; other commands take no URLs')
    try:
        print(json.dumps(run(args.command, args.urls), sort_keys=True))
    except BlockingIOError:
        print(json.dumps({'event': 'already_running'}))
    except (OSError, ValueError, ET.ParseError, subprocess.SubprocessError) as error:
        try:
            export_status(load_state(STATE_DIR / 'state.json'), False)
        except (OSError, ValueError):
            pass
        print(json.dumps({'event': 'failed_state_preserved', 'reason': str(error)}))
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
