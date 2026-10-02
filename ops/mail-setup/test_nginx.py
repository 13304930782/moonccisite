"""Actual local TLS Nginx topology; no production access, DNS or mail authentication."""
import getpass, os, shutil, socket, ssl, subprocess, tempfile, time, unittest
import urllib.request, urllib.error
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
NGINX = os.environ.get('NGINX_BINARY') or shutil.which('nginx')

def port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0)); return s.getsockname()[1]

class Routing(unittest.TestCase):
    def test_origin_gateway_and_dedicated_host(self):
        if not NGINX: self.fail('Install nginx or provide NGINX_BINARY; do not count this check as passed.')
        with tempfile.TemporaryDirectory(prefix='mooncci-mail-nginx-') as tmp:
            d = Path(tmp); web = d/'web'; (web/'mail').mkdir(parents=True)
            xml = (ROOT/'public/mail/config-v1.1.xml').read_bytes()
            (web/'mail/config-v1.1.xml').write_bytes(xml)
            (web/'index.html').write_text('<html>SPA</html>')
            (web/'.env').write_text('PRIVATE FIXTURE')
            cert, key = d/'cert.pem', d/'key.pem'
            subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=mooncci.site', '-addext', 'subjectAltName=DNS:mooncci.site,DNS:autoconfig.mooncci.site,IP:127.0.0.1', '-keyout', str(key), '-out', str(cert)], check=True, capture_output=True)
            cn, us, auto, http, api = [port() for _ in range(5)]
            backend = subprocess.Popen(['node', '-e', f"require({str(ROOT / 'server/src/index.js')!r}).listen({api}, '127.0.0.1')"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            self.addCleanup(lambda: (backend.terminate(), backend.communicate(timeout=5)))
            for _ in range(100):
                try:
                    with socket.create_connection(('127.0.0.1', api), timeout=.1): break
                except OSError: time.sleep(.05)
            origin = (ROOT/'ops/mail-setup/origin.conf.template').read_text().replace('@WEB_ROOT@', str(web)).replace('127.0.0.1:3001', f'127.0.0.1:{api}')
            gateway = (ROOT/'ops/mail-setup/gateway.conf.template').read_text().replace('@PRIMARY@', f'127.0.0.1:{cn}').replace('@CA_BUNDLE@', str(cert))
            dedicated = (ROOT/'ops/mail-setup/autoconfig-vhost.conf.template').read_text().replace('@WEB_ROOT@', str(web)).replace('@CERTIFICATE@', str(cert)).replace('@PRIVATE_KEY@', str(key)).replace('listen 80;', f'listen 127.0.0.1:{http};').replace('listen 443 ssl;', f'listen 127.0.0.1:{auto} ssl;')
            configuration = f'''user {getpass.getuser()}; daemon off; master_process off;
pid {d}/nginx.pid; error_log {d}/error.log warn;
events {{ worker_connections 32; }}
http {{ fastcgi_temp_path {d}/fastcgi; uwsgi_temp_path {d}/uwsgi; scgi_temp_path {d}/scgi; access_log {d}/access.log; client_body_temp_path {d}/body; proxy_temp_path {d}/proxy;
server {{ listen 127.0.0.1:{cn} ssl; server_name mooncci.site;
ssl_certificate {cert}; ssl_certificate_key {key}; root {web};
add_header X-Existing-Security preserved always;
error_page 404 /index.html;
{origin}
location ~ /\\. {{ return 403; }}
location / {{ try_files $uri /index.html; }}
}}
server {{ listen 127.0.0.1:{us} ssl; server_name mooncci.site;
ssl_certificate {cert}; ssl_certificate_key {key};
add_header X-Existing-Security preserved always;
{gateway}
location / {{ return 404; }}
}}
{dedicated}
}}'''
            conf = d/'nginx.conf'; conf.write_text(configuration)
            check = subprocess.run([NGINX, '-t', '-p', tmp, '-c', str(conf)], capture_output=True)
            self.assertEqual(check.returncode, 0, check.stderr.decode())
            process = subprocess.Popen([NGINX, '-p', tmp, '-c', str(conf)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            try:
                for _ in range(60):
                    try:
                        with socket.create_connection(('127.0.0.1', cn), timeout=.1): break
                    except OSError: time.sleep(.05)
                context = ssl.create_default_context(cafile=str(cert))
                opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context))
                def get(p, path):
                    try: r = opener.open(f'https://127.0.0.1:{p}{path}', timeout=3)
                    except urllib.error.HTTPError as e: r = e
                    with r: return r.status, r.headers, r.read()
                for p in [cn, us]:
                    for route in ['/.well-known/autoconfig/mail/config-v1.1.xml', '/mail/config-v1.1.xml']:
                        for suffix in ['', '?emailaddress=privacy-canary%40mooncci.site']:
                            status, headers, body = get(p, route+suffix)
                            self.assertEqual(status, 200); self.assertEqual(body, xml)
                            self.assertEqual(headers.get_content_type(), 'application/xml')
                            self.assertEqual(headers['X-Existing-Security'], 'preserved')
                    # Invalid tickets are application errors, never SPA HTML.
                    status, headers, body = get(p, '/api/mail-setup/profile/not-a-ticket.mobileconfig')
                    self.assertEqual(status, 404); self.assertNotIn(b'SPA', body)
                for p in [cn, us]:
                    request = urllib.request.Request(f'https://127.0.0.1:{p}/api/mail-setup/profile', data=b'Privacy.Canary&work@mooncci.site', headers={'Content-Type': 'text/plain', 'X-Requested-With': 'XMLHttpRequest', 'Origin': 'https://mooncci.site'})
                    with opener.open(request, timeout=3) as r:
                        import json, plistlib
                        self.assertEqual(r.status, 201); self.assertIn('no-store', r.headers['Cache-Control'])
                        download = json.load(r)['download']
                    status, headers, body = get(p, download)
                    self.assertEqual(status, 200); self.assertIn('no-store', headers['Cache-Control'])
                    self.assertEqual(headers.get_content_type(), 'application/x-apple-aspen-config')
                    self.assertEqual(plistlib.loads(body)['PayloadContent'][0]['EmailAddress'], 'Privacy.Canary&work@mooncci.site')
                    self.assertEqual(headers['X-Existing-Security'], 'preserved')
                    self.assertNotIn('Privacy.Canary', (d/'access.log').read_text())
                    self.assertNotIn('Privacy.Canary', (d/'error.log').read_text())
                    self.assertNotIn(download, (d/'access.log').read_text())
                self.assertFalse(list((d/'body').glob('*')), 'profile request must not be stored on disk')
                self.assertFalse(list((d/'proxy').glob('*')), 'profile response must not be stored on disk')
                self.assertEqual(get(auto, '/mail/config-v1.1.xml?emailaddress=privacy-canary')[2], xml)
                self.assertEqual(get(auto, '/random')[0], 404)
                self.assertEqual(get(cn, '/.env')[0], 403)
                self.assertEqual(get(cn, '/.git/config')[0], 403)
                self.assertIn(b'SPA', get(cn, '/mail-setup')[2])
                (web/'mail/config-v1.1.xml').unlink()
                for p in [cn, us, auto]:
                    status, _, body = get(p, '/mail/config-v1.1.xml')
                    self.assertEqual(status, 404); self.assertNotIn(b'SPA', body)
                self.assertNotIn('privacy-canary', (d/'access.log').read_text())
                self.assertNotIn('privacy-canary', (d/'error.log').read_text())
            finally:
                process.terminate(); process.communicate(timeout=5)

if __name__ == '__main__': unittest.main()
