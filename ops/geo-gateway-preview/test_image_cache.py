"""Real Nginx policy tests with isolated HTTP upstream, plus existing gateway regression."""
import http.client
import os
import shutil
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from image_cache import BLOCK, VARY, patch
from keepalive import patch as keepalive
from render import render

ROOT = Path(__file__).resolve().parents[2]
NGINX = os.environ.get('NGINX_TEST_BINARY') or shutil.which('nginx') or str(ROOT / '.cache/nginx-test/nginx-1.28.0/nginx.exe')

class ImageCacheTest(unittest.TestCase):
    def test_patch_bounds(self):
        original = keepalive(render('US', '/cert', '/key', 'a'*64))
        result = patch(original)
        self.assertEqual(result.count('add_header Cache-Control $mooncci_raster_browser_cache always;'), 2)
        self.assertEqual(result.count('add_header Cache-Control "private, no-store" always;'), 2)
        self.assertEqual(result.count('proxy_cache off;'), original.count('proxy_cache off;'))
        self.assertEqual(result.count(VARY), 2)
        old = result.replace('\n    ' + VARY, '')
        self.assertEqual(patch(old), result, 'upgrade existing deployed cache map')
        for changed in (result, original.replace('proxy_ssl_verify on;', 'proxy_ssl_verify off;'), original.replace('X-Mooncci-Node US', 'X-Mooncci-Node CN')):
            with self.assertRaises(ValueError): patch(changed)

    def test_real_nginx_cache_boundaries(self):
        self.assertTrue(Path(NGINX).is_file(), 'Set NGINX_TEST_BINARY to an installed Nginx executable')
        (ROOT / '.cache').mkdir(exist_ok=True)
        state = {'status': 200, 'type': 'image/webp', 'cache': 'public, max-age=0', 'cookie': ''}
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def do_GET(self):
                self.send_response(state['status'])
                self.send_header('Content-Type', state['type'])
                self.send_header('Cache-Control', state['cache'])
                if state['cookie']: self.send_header('Set-Cookie', state['cookie'])
                self.send_header('Content-Length', '2')
                self.end_headers()
                if self.command != 'HEAD': self.wfile.write(b'ok')
            do_HEAD = do_GET
            do_POST = do_GET
        upstream = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=upstream.serve_forever, daemon=True).start()
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
        with tempfile.TemporaryDirectory(dir=ROOT / '.cache') as directory:
            base = Path(directory); (base/'logs').mkdir(); (base/'temp').mkdir()
            config = 'worker_processes 1;\npid logs/nginx.pid;\nevents { worker_connections 64; }\nhttp {\n' + BLOCK + ('server { listen 127.0.0.1:%d; location / { proxy_pass http://127.0.0.1:%d; proxy_hide_header Cache-Control; add_header Cache-Control $mooncci_raster_browser_cache always; ' % (port, upstream.server_port)) + VARY + ' } } }'
            (base/'nginx.conf').write_bytes(config.encode())
            command = [str(NGINX), '-p', base.as_posix()+'/', '-c', 'nginx.conf']
            check = subprocess.run(command+['-t'], capture_output=True)
            self.assertEqual(check.returncode, 0, check.stderr.decode())
            process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            def request(path='/api/uploads/test-image.webp', method='GET', headers=None):
                conn = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
                conn.request(method, path, headers=headers or {})
                response = conn.getresponse(); policy = response.getheader('Cache-Control'); response.read(); conn.close()
                return policy
            try:
                for _ in range(50):
                    try:
                        with socket.create_connection(('127.0.0.1', port), timeout=.2): break
                    except OSError: time.sleep(.1)
                allowed = 'private, max-age=60, must-revalidate'
                denied = 'private, no-store'
                self.assertEqual(request(), allowed)
                self.assertEqual(request(method='HEAD'), allowed)
                self.assertEqual(request('/api/uploads/test-image.webp?v=2'), allowed)
                browser = subprocess.run(['node', str(ROOT/'scripts/test-image-cache-credentials.cjs'), str(port)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45)
                self.assertEqual(browser.returncode, 0, browser.stdout.decode(errors='replace') + browser.stderr.decode(errors='replace'))
                for header in ('Cookie', 'Authorization', 'Proxy-Authorization', 'Range'):
                    self.assertEqual(request(headers={header: 'test'}), denied, header)
                self.assertEqual(request(method='POST'), denied)
                for path in ('/', '/api/posts', '/api/uploads/test.svg', '/api/uploads/folder/test.webp'):
                    self.assertEqual(request(path), denied, path)
                for key, values in {'status': [304, 404, 500], 'type': ['text/html', 'application/json'], 'cache': ['private, no-store', 'no-cache', ''], 'cookie': ['session=private']}.items():
                    old = state[key]
                    for value in values:
                        state[key] = value
                        self.assertEqual(request(), denied, (key, value))
                    state[key] = old
            finally:
                subprocess.run(command+['-s', 'quit'], capture_output=True, timeout=10)
                process.wait(timeout=10)
                upstream.shutdown(); upstream.server_close()

if __name__ == '__main__': unittest.main()
