import http.client
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from primary_ip import patch,MARK
ROOT=Path(__file__).resolve().parents[2]
BASE='server { listen 80; server_name mooncci.site www.mooncci.site; location / { proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_pass http://127.0.0.1:3001; } }'
class PrimaryIPTests(unittest.TestCase):
    def test_scope(self):
        other='server { server_name other.example; location / { return 200 "literal { brace }"; } }'
        s=patch('# comment {\n'+BASE+other)
        self.assertIn(other,s);self.assertEqual(s.count(MARK),1)
        self.assertNotIn('$proxy_add_x_forwarded_for',s)
        with self.assertRaises(ValueError):patch(BASE.replace('www.mooncci.site','other.example'))
        with self.assertRaises(ValueError):patch(s)
        with self.assertRaises(ValueError):patch(BASE.replace('$proxy_add_x_forwarded_for','$http_x_forwarded_for'))
    def test_real_nginx_trust_boundary(self):
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_GET(self):
                b=json.dumps(dict(self.headers)).encode();self.send_response(200);self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
        upstream=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        threading.Thread(target=upstream.serve_forever,daemon=True).start()
        with tempfile.TemporaryDirectory(prefix='realip-',dir=str(ROOT/'.cache')) as tmp:
            base=Path(tmp);(base/'logs').mkdir();(base/'temp').mkdir()
            with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
            config=patch(BASE).replace('listen 80;','listen 127.0.0.1:'+str(port)+';').replace(':3001;',':'+str(upstream.server_port)+';')
            config=config.replace('set_real_ip_from 107.174.123.42;','set_real_ip_from 127.0.0.2;')
            (base/'nginx.conf').write_text('worker_processes 1; error_log logs/error.log; pid logs/nginx.pid; events { worker_connections 128; } http { '+config+' }')
            args=[str(ROOT/'.cache/nginx-test/nginx-1.28.0/nginx.exe'),'-p',base.as_posix()+'/', '-c','nginx.conf']
            r=subprocess.run(args+['-t'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            self.assertEqual(r.returncode,0,r.stderr.decode())
            p=subprocess.Popen(args,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            try:
                for i in range(50):
                    try:
                        with socket.create_connection(('127.0.0.1',port),timeout=.2):break
                    except OSError:time.sleep(.1)
                for source,expected in [('127.0.0.1','127.0.0.1'),('127.0.0.2','203.0.113.77')]:
                    c=http.client.HTTPConnection('127.0.0.1',port,source_address=(source,0),timeout=5)
                    c.request('GET','/',headers={'Host':'mooncci.site','X-Forwarded-For':'198.51.100.1, 203.0.113.77'})
                    r=c.getresponse();self.assertEqual(r.status,200)
                    self.assertEqual(json.loads(r.read())['X-Forwarded-For'],expected);c.close()
            finally:
                subprocess.run(args+['-s','quit'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10);p.wait(timeout=10)
                upstream.shutdown();upstream.server_close()
if __name__=='__main__':unittest.main()
