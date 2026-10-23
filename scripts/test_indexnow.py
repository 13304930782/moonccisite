import importlib.util
import http.client
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import urllib.robotparser

spec = importlib.util.spec_from_file_location('indexnow', Path(__file__).with_name('indexnow.py'))
index = importlib.util.module_from_spec(spec)
spec.loader.exec_module(index)
BASE = 'https://moooncci.cn'
KEY = 'a' * 64


def xml(rows):
    return ('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + ''.join(
        '<url><loc>{}</loc>{}</url>'.format(BASE + path,
            '<lastmod>{}</lastmod>'.format(date) if date else '')
        for path, date in rows) + '</urlset>').encode()


class IndexNowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.admin = self.directory / 'admin'
        (self.admin / 'requests').mkdir(parents=True)
        (self.directory / 'key').write_text(KEY, encoding='utf-8')
        self.current = {BASE + '/': None, BASE + '/article/18': '2026-10-01T00:00:00+00:00'}
        self.sent = []
        self.http = 200
        self.pages = {}
        policy = urllib.robotparser.RobotFileParser()
        policy.parse(['User-agent: *', 'Disallow: /api/'])
        self.patches = [patch.object(index, 'STATE_DIR', self.directory),
                        patch.object(index, 'ADMIN_DIR', self.admin),
                        patch.object(index, 'fresh_sitemap', side_effect=lambda: self.current.copy()),
                        patch.object(index, 'robots_policy', return_value=policy),
                        patch.object(index, 'page_status', side_effect=lambda url: self.pages.get(url, 'public')),
                        patch.object(index, 'request', side_effect=self.send)]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def send(self, url, data=None):
        self.assertEqual(url, index.ENDPOINT)
        payload = json.loads(data.decode())
        self.assertEqual(payload['host'], 'moooncci.cn')
        self.assertEqual(payload['keyLocation'], BASE + '/' + KEY + '.txt')
        self.sent.append(payload['urlList'])
        if isinstance(self.http, Exception):
            raise self.http
        return self.http, {'Retry-After': '3600'}, b'status ' + KEY.encode()

    def state(self):
        return index.load_state(self.directory / 'state.json')

    def inbox(self, url, action='submit', **extra):
        data = dict(version=1, url=url, action=action, requestedAt=index.iso_time(index.time.time()-1), actorId=1)
        data.update(extra)
        target = self.admin / 'requests' / (index.hashlib.sha256(url.encode()).hexdigest() + '.json')
        target.write_text(json.dumps(data), encoding='utf-8')
        return target

    def test_status_pending_urls_contract_is_bounded_and_sanitized(self):
        self.current.update({BASE + '/updates/' + str(n): None for n in range(1, 151)})
        self.http = 503
        index.run('run')
        status = json.loads((self.admin / 'status.json').read_text())
        self.assertEqual(status['pendingCount'], 152)
        self.assertEqual(len(status['pendingUrls']), 100)
        for item in status['pendingUrls']:
            self.assertEqual(set(item), {'url', 'kind'})
            self.assertIn(item['url'], self.current)
            self.assertEqual(item['kind'], 'change')

    def test_admin_known_url_receipt_and_redacted_status(self):
        index.run('run')
        target = self.inbox(BASE + '/')
        self.assertEqual(index.run('run')['count'], 1)
        self.assertFalse(target.exists())
        status = json.loads((self.admin / 'status.json').read_text())
        self.assertEqual(status['receipts'][-1]['urls'], [BASE + '/'])
        self.assertEqual(status['receipts'][-1]['endpoint'], index.ENDPOINT)
        self.assertNotIn(KEY, json.dumps(status))
        self.assertNotIn('identity', json.dumps(status))
        self.assertTrue(status['lastRun']['ok'])

    def test_admin_invalid_unknown_expired_and_malformed(self):
        index.run('run')
        for url, extras in [('https://evil.example/', {}), (BASE + '/article/9999', {}),
                            (BASE + '/', {'requestedAt': '2000-01-01T00:00:00Z'}),
                            (BASE + '/', {'actorId': True})]:
            target = self.inbox(url, **extras)
            index.run('run')
            self.assertFalse(target.exists())
        target = self.inbox(BASE + '/')
        target.write_bytes(b'not json')
        index.run('run')
        self.assertFalse(target.exists())
        self.assertEqual(len(self.sent), 1)

    def test_admin_persisted_identity_prevents_crash_replay(self):
        index.run('run')
        target = self.inbox(BASE + '/')
        raw = target.read_bytes()
        index.run('run')
        target.write_bytes(raw)
        index.run('run')
        self.assertEqual(len(self.sent), 2)

    def test_admin_retry_global_cooldown_and_pending_requirement(self):
        self.http = 403
        index.run('run')
        self.inbox(BASE + '/', 'retry')
        index.run('run')
        self.assertEqual(len(self.sent), 2)
        self.inbox(BASE + '/article/18', 'retry')
        index.run('run')
        self.assertEqual(len(self.sent), 2)
        self.assertEqual(self.state()['admin_requests'][-1]['state'], 'rejected')

    def test_admin_oversized_and_symlink_files_are_not_read(self):
        index.run('run')
        target = self.inbox(BASE + '/')
        target.write_bytes(b'x' * 16385)
        index.run('run')
        self.assertTrue(target.exists())
        self.assertEqual(len(self.sent), 1)
        target.unlink()
        secret = self.directory / 'secret'
        secret.write_text('private', encoding='utf-8')
        try:
            target.symlink_to(secret)
        except OSError:
            self.skipTest('Symlink creation unavailable on this host')
        index.run('run')
        self.assertTrue(target.is_symlink())
        self.assertEqual(secret.read_text(), 'private')
        self.assertEqual(len(self.sent), 1)
        target.unlink()

    def test_admin_stale_sitemap_keeps_request_unconsumed(self):
        index.run('run')
        target = self.inbox(BASE + '/')
        with patch.object(index, 'fresh_sitemap', side_effect=ValueError('stale')):
            with self.assertRaises(ValueError):
                index.run('run')
        self.assertTrue(target.exists())
        self.assertEqual(len(self.sent), 1)

    def test_bridge_atomic_failure_preserves_previous_status(self):
        index.run('run')
        target = self.admin / 'status.json'
        before = target.read_bytes()
        with patch.object(index.os, 'replace', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                index.export_status(self.state())
        self.assertEqual(target.read_bytes(), before)
        index.export_status(self.state(), False)
        self.assertFalse(json.loads(target.read_text())['lastRun']['ok'])

    def test_initial_backfill_and_unchanged_restart_no_duplicate(self):
        self.assertEqual(index.run('run')['count'], 2)
        self.assertEqual(index.run('run')['event'], 'no_submission')
        self.assertEqual(index.run('status')['pending'], 0)
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(set(self.state()['seen']), set(self.current))

    def test_new_updated_withdrawn_all_three_content_types(self):
        index.run('run')
        self.current[BASE + '/article/18'] = '2026-10-02T00:00:00+00:00'
        self.current[BASE + '/updates/2'] = '2026-10-02T01:00:00+00:00'
        self.current[BASE + '/projects/demo'] = '2026-10-02T02:00:00+00:00'
        self.assertEqual(index.run('run')['count'], 3)
        for path in ('/article/18', '/updates/2', '/projects/demo'):
            del self.current[BASE + path]
            self.pages[BASE + path] = 'gone'
        self.assertEqual(index.run('run')['count'], 3)
        self.assertEqual(index.run('run')['event'], 'no_submission')

    def test_slug_urls_survive_persisted_queue_without_duplicate_submission(self):
        self.current[BASE + '/article/english-slug'] = None
        self.current[BASE + '/article/cities%3Askylinesii-basic-mod'] = None
        self.assertEqual(index.run('run')['count'], 4)
        self.assertEqual(index.run('run')['event'], 'no_submission')
        self.assertEqual(set(self.state()['seen']), set(self.current))

    def test_missing_still_public_or_timeout_never_implies_delete(self):
        index.run('run')
        del self.current[BASE + '/article/18']
        for status in ('public', 'unknown'):
            self.pages[BASE + '/article/18'] = status
            self.assertEqual(index.run('run')['pending'], 1)
            self.assertEqual(len(self.sent), 1)
        self.current[BASE + '/article/18'] = '2026-10-01T00:00:00+00:00'
        self.pages[BASE + '/article/18'] = 'public'
        self.assertEqual(index.run('run')['count'], 1)

    def test_no_lastmod_does_not_invent_update_manual_submit_deduplicates(self):
        index.run('run')
        index.run('run')
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(index.run('submit', [BASE + '/', BASE + '/'])['count'], 1)
        with self.assertRaises(ValueError):
            index.run('submit', [BASE + '/article/999999'])

    def test_network_429_5xx_queue_and_backoff_survive_restart(self):
        for code in (urllib.error.URLError('timeout'), 429, 500, 503):
            with self.subTest(code=code):
                if (self.directory / 'state.json').exists():
                    (self.directory / 'state.json').unlink()
                self.http = code
                before = len(self.sent)
                first = index.run('run')
                self.assertEqual(first['result'], 'retry_scheduled')
                self.assertEqual(len(self.state()['pending']), 2)
                self.assertGreater(self.state()['next_attempt'], index.time.time())
                self.assertEqual(index.run('run')['event'], 'deferred')
                self.assertEqual(len(self.sent), before + 1)
                self.http = 200
                with patch.object(index.time, 'time', return_value=self.state()['next_attempt'] + 1):
                    self.assertEqual(index.run('run')['pending'], 0)

    def test_permanent_failures_redacted_and_require_operator_retry(self):
        for code in (400, 403, 422):
            with self.subTest(code=code):
                if (self.directory / 'state.json').exists():
                    (self.directory / 'state.json').unlink()
                self.http = code
                self.assertEqual(index.run('run')['result'], 'blocked_operator_action_required')
                self.assertNotIn(KEY, json.dumps(self.state()))
                for _ in range(3):
                    self.assertEqual(index.run('run')['event'], 'deferred')
                self.http = 200
                self.assertEqual(index.run('retry')['pending'], 0)

    def test_202_is_accepted_not_indexed_or_repeated(self):
        self.http = 202
        self.assertEqual(index.run('run')['result'], 'accepted_key_verification_pending')
        self.assertEqual(index.run('run')['event'], 'no_submission')

    def test_invalid_or_stale_sitemap_preserves_state_and_queue(self):
        self.http = 503
        index.run('run')
        before = (self.directory / 'state.json').read_bytes()
        with patch.object(index, 'fresh_sitemap', side_effect=ValueError('stale or malformed sitemap')):
            with self.assertRaises(ValueError):
                index.run('run')
        self.assertEqual((self.directory / 'state.json').read_bytes(), before)
        self.assertEqual(len(self.sent), 1)

    def test_batching_and_process_interruption_keep_intent(self):
        self.current.update({BASE + '/updates/' + str(n): None for n in range(1, 151)})
        self.assertEqual(index.run('run')['count'], 100)
        self.assertEqual(index.run('run')['count'], 52)
        self.assertEqual(index.run('run')['event'], 'no_submission')
        self.current[BASE + '/updates/200'] = None
        with patch.object(index, 'flush', side_effect=RuntimeError('process stopped after persistence')):
            with self.assertRaises(RuntimeError):
                index.run('run')
        self.assertIn(BASE + '/updates/200', self.state()['pending'])
        self.assertEqual(index.run('run')['count'], 1)

    def test_concurrent_run_rejected(self):
        with index.exclusive(self.directory / 'lock'):
            with self.assertRaises(BlockingIOError):
                index.run('run')
        self.assertFalse(self.sent)

    def test_slow_unknown_queue_head_does_not_starve_later_urls(self):
        self.pages[BASE + '/'] = 'unknown'
        with patch.object(index.time, 'monotonic', side_effect=[0, 1, 121]):
            self.assertEqual(index.run('run')['event'], 'no_submission')
        with patch.object(index.time, 'monotonic', side_effect=[0, 1, 121]):
            self.assertEqual(index.run('run')['count'], 1)
        self.assertEqual(self.sent, [[BASE + '/article/18']])

    def test_robots_exclusion_and_private_noindex_not_submitted(self):
        self.pages[BASE + '/article/18'] = 'gone'
        policy = urllib.robotparser.RobotFileParser()
        policy.parse(['User-agent: *', 'Disallow: /'])
        with patch.object(index, 'robots_policy', return_value=policy):
            self.assertEqual(index.run('run')['event'], 'no_submission')
        self.assertFalse(self.sent)


class BoundaryTest(unittest.TestCase):
    def test_url_allowlist(self):
        valid = ['/', '/article/18', '/article/cities-skylines-2-basic-mods',
                 '/article/cities%3Askylinesii-basic-mod', '/article/legacy.v1',
                 '/article/pingu%E4%BC%81%E9%B9%85', '/article/2024-11-13c%25e8%25af%25ad',
                 '/updates/2', '/projects/demo-v2',
                 '/tag/All%20Aboard', '/category/%E5%BB%BA%E7%AB%99', '/tag/100%25',
                 '/category/100%25', '/tag/%252fadmin', '/tag/path%5Cname']
        for path in valid:
            self.assertEqual(index.public_url(BASE + path), BASE + path)
        invalid = ['/admin', '/account', '/api/posts', '/assets/index.js', '/uploads/a.png',
                   '/subscriptions/private', '/article/18?preview=1', '/articles?verify=1',
                   '/article/01', '/article/18#x', '/article/..', '/article/%2Fadmin',
                   '/article/a%5Cb', '/article/a%3Fb', '/article/a%23b', '/article/%00',
                   '/article/%FF', '/article/%ZZ', '/article/%61', '/article/' + 'a' * 256,
                   '/tag/..',
                   '/tag/%2Fadmin', '/tag/%00', '/tag/%e5%bb%ba', '/tag/%FF']
        for url in [BASE + path for path in invalid] + ['http://moooncci.cn/', 'https://www.moooncci.cn/',
                'https://127.0.0.1/', 'https://moooncci.cn:443/', 'https://user@moooncci.cn/']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                index.public_url(url)

    def test_existing_xml_validator_and_real_dates(self):
        with patch.object(index, 'VALIDATOR', Path(__file__).with_name('refresh-sitemap.py')):
            rows = index.snapshot(xml([('/', None), ('/article/18', '2026-10-01T00:00:00.000Z')]))
            self.assertIsNone(rows[BASE + '/'])
            self.assertEqual(rows[BASE + '/article/18'], '2026-10-01T00:00:00+00:00')
            for bad in (b'<html>bad</html>', xml([]), xml([('/', None), ('/', None)]),
                        xml([('/admin', None)]), xml([('/', 'garbage')]), xml([('/', '2999-01-01')]),
                        b'<!DOCTYPE x><urlset/>'):
                with self.assertRaises(ValueError):
                    index.snapshot(bad)

    def test_freshness_uses_success_not_unchanged_file_mtime(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'sitemap.xml'
            target.write_bytes(xml([('/', None)]))
            now = index.time.monotonic()
            output = 'Result=success\nExecMainStatus=0\nExecMainExitTimestampMonotonic={}\n'.format(int(now * 1000000))
            with patch.object(index, 'SITEMAP', target), patch.object(index, 'VALIDATOR', Path(__file__).with_name('refresh-sitemap.py')), patch.object(index.subprocess, 'check_output', return_value=output):
                self.assertEqual(index.fresh_sitemap(), {BASE + '/': None})
                with patch.object(index.time, 'monotonic', return_value=now + 901):
                    with self.assertRaises(ValueError):
                        index.fresh_sitemap()
            with patch.object(index.subprocess, 'check_output', return_value=output.replace('success', 'exit-code')):
                with self.assertRaises(ValueError):
                    index.fresh_sitemap()

    def test_public_http_confirmation(self):
        good = b'<html><head><link rel="canonical" href="https://moooncci.cn/article/18"></head><body><div id="root">body</div></body></html>'
        for code, headers, body, expected in [(200, {'Content-Type': 'text/html'}, good, 'public'),
                (404, {}, b'', 'gone'), (410, {}, b'', 'gone'), (503, {}, b'', 'unknown'),
                (302, {}, b'', 'unknown'), (200, {'Content-Type': 'text/html'}, b'<html>Login</html>', 'unknown'),
                (200, {'Content-Type': 'text/html', 'X-Robots-Tag': 'noindex'}, good, 'gone'),
                (200, {'Content-Type': 'text/html'}, good.replace(b'</head>', b'<meta name="robots" content="noindex"></head>'), 'gone')]:
            with self.subTest(code=code, expected=expected), patch.object(index, 'request', return_value=(code, headers, body)):
                self.assertEqual(index.page_status(BASE + '/article/18'), expected)

    def test_atomic_failure_keeps_state_and_corrupt_state_not_reset(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'state.json'
            target.write_bytes(b'broken json')
            with self.assertRaises(ValueError):
                index.load_state(target)
            with patch.object(index.os, 'replace', side_effect=OSError('disk failed')):
                with self.assertRaises(OSError):
                    index.save_state(target, {'test': True})
            self.assertEqual(target.read_bytes(), b'broken json')
            self.assertEqual(list(Path(directory).iterdir()), [target])

    def test_truncated_http_response_enters_network_failure_path(self):
        with patch.object(index.urllib.request, 'build_opener') as factory:
            factory.return_value.open.return_value.read.side_effect = http.client.IncompleteRead(b'partial')
            with self.assertRaises(OSError):
                index.request(index.ENDPOINT, b'{}')


if __name__ == '__main__':
    unittest.main()
