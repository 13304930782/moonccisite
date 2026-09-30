import importlib.util
from pathlib import Path
import tempfile
import unittest
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch as mock
from keepalive import patch as keepalive
from render import render

spec = importlib.util.spec_from_file_location('installer', Path(__file__).with_name('install-image-cache.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

class InstallTest(unittest.TestCase):
    def test_missing_304_body_file(self):
        def command(args):
            Path(args[args.index('--dump-header')+1]).write_bytes(b'HTTP/1.1 304 Not Modified\r\nCache-Control: private, max-age=60, must-revalidate\r\n\r\n')
            return b'304'
        with mock.object(m, 'command', command):
            result = m.probe(m.IMAGE, etag='"fixture"')
        self.assertEqual((result['status'], result['bytes'], result['sha256']), (304, 0, m.digest(b'')))

    def test_missing_200_body_is_still_an_error(self):
        def command(args):
            Path(args[args.index('--dump-header')+1]).write_bytes(b'HTTP/1.1 200 OK\r\n\r\n')
            return b'200'
        with mock.object(m, 'command', command), self.assertRaises(FileNotFoundError):
            m.probe(m.IMAGE)

    def test_curl_failure_is_still_an_error(self):
        with mock.object(m, 'command', side_effect=RuntimeError('curl failed')), self.assertRaises(RuntimeError):
            m.probe(m.IMAGE, etag='"fixture"')

    def test_real_curl_200_and_304(self):
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def do_GET(self):
                matched = self.headers.get('If-None-Match') == '"fixture"'
                self.send_response(304 if matched else 200)
                self.send_header('ETag', '"fixture"')
                self.send_header('Cache-Control', 'private, max-age=60, must-revalidate')
                if not matched: self.send_header('Content-Length', '5')
                self.end_headers()
                if not matched: self.wfile.write(b'image')
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        original = m.command
        def command(args):
            return original([a.replace('https://mooncci.site', 'http://127.0.0.1:'+str(server.server_port)) for a in args])
        try:
            with mock.object(m, 'command', command):
                baseline = m.probe(m.IMAGE)
                conditional = m.probe(m.IMAGE, etag=baseline['etag'][0])
            self.assertEqual((baseline['status'], baseline['bytes'], baseline['sha256']), (200, 5, m.digest(b'image')))
            self.assertEqual((conditional['status'], conditional['bytes']), (304, 0))
        finally:
            server.shutdown(); server.server_close(); thread.join(timeout=5)

    def scenario(self, failure=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); live = root/'mooncci.site.conf'; backup = root/'backup'
            baseline = keepalive(render('US', '/cert', '/key', 'a'*64)).encode(); live.write_bytes(baseline)
            probes = [0]; commands = []
            def make_backup(**kwargs): backup.mkdir(); return str(backup)
            def probe(path, cookie=False, etag=None):
                probes[0] += 1
                if failure == 'health' and probes[0] == 2: raise RuntimeError('simulated health failure')
                if etag:
                    return {'status':304,'bytes':0,'cache':['private, no-store' if failure == 'conditional' else 'private, max-age=60, must-revalidate']}
                return {'status': 404 if 'missing' in path else 200, 'etag':['"fixture"'], 'cache': ['private, max-age=60, must-revalidate' if probes[0] == 2 else 'private, no-store'], 'vary': [] if failure == 'vary' else ['Cookie, Authorization, Proxy-Authorization, Range'], 'sha256': 'same', 'node': ['US']}
            def command(args):
                commands.append(args)
                if failure == 'syntax' and len(commands) == 2: raise RuntimeError('simulated syntax failure')
            with mock.object(m, 'VHOST', live), mock.object(m, 'probe', probe), mock.object(m, 'command', command), mock.object(m, 'atomic', lambda data, metadata: live.write_bytes(data)), mock.object(m.tempfile, 'mkdtemp', make_backup), mock.object(m.time, 'sleep'):
                if failure:
                    with self.assertRaises(RuntimeError): m.deploy()
                    self.assertEqual(live.read_bytes(), baseline)
                else:
                    m.deploy()
                    self.assertIn(b'max-age=60', live.read_bytes())
                    self.assertTrue((backup/'verification.json').exists())
                self.assertEqual((backup/'mooncci.site.conf').read_bytes(), baseline)
    def test_success(self): self.scenario()
    def test_health_rollback(self): self.scenario('health')
    def test_syntax_rollback(self): self.scenario('syntax')
    def test_missing_vary_rollback(self): self.scenario('vary')
    def test_conditional_cache_rollback(self): self.scenario('conditional')

if __name__ == '__main__': unittest.main()
