"""Real Nginx integration test against isolated local TLS/HTTP upstreams."""
import http.client
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import json
from pathlib import Path
import socket
import ssl
import subprocess
import tempfile
import threading
import time
import unittest
from render import render
ROOT=Path(__file__).resolve().parents[2]
NGINX=ROOT/'.cache/nginx-test/nginx-1.28.0/nginx.exe'
OPENSSL=Path('C:/Program Files/Git/usr/bin/openssl.exe')

class GatewayTest(unittest.TestCase):
    def test_real_nginx_forwarding_and_fallback(self):
        primary_calls=[];reader_calls=[];reader_status=[200];primary_status=[200]
        def handler(calls,is_reader):
            class Handler(BaseHTTPRequestHandler):
                def log_message(self,*args):pass
                def do_GET(self):
                    body=self.rfile.read(int(self.headers.get('Content-Length','0')))
                    data={'method':self.command,'path':self.path,'headers':dict(self.headers),'body':body.decode()}
                    calls.append(data)
                    status=reader_status[0] if is_reader else primary_status[0]
                    payload=json.dumps(data).encode()
                    self.send_response(status)
                    self.send_header('Content-Type','application/json')
                    self.send_header('Set-Cookie','test_session=opaque; Secure; HttpOnly; SameSite=Lax; Path=/')
                    if status==302:self.send_header('Location','https://mooncci.site/api/auth/github/callback?state=opaque')
                    self.send_header('Content-Length',str(len(payload)))
                    self.end_headers()
                    if self.command!='HEAD':self.wfile.write(payload)
                do_POST=do_GET
                do_HEAD=do_GET
                do_PATCH=do_GET
            return Handler
        with tempfile.TemporaryDirectory(prefix='gateway-',dir=str(ROOT/'.cache')) as temp:
            base=Path(temp);cert=base/'cert.pem';key=base/'key.pem'
            subprocess.run([str(OPENSSL),'req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(key),'-out',str(cert),'-days','1','-subj','/CN=mooncci.site','-addext','subjectAltName=DNS:mooncci.site'],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            primary=ThreadingHTTPServer(('127.0.0.1',0),handler(primary_calls,False))
            ctx=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);ctx.load_cert_chain(str(cert),str(key));primary.socket=ctx.wrap_socket(primary.socket,server_side=True)
            reader=ThreadingHTTPServer(('127.0.0.1',0),handler(reader_calls,True))
            for server in (primary,reader):threading.Thread(target=server.serve_forever,daemon=True).start()
            def port():
                with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
            http_port=port();https_port=port()
            config=render('US','/tmp/test-cert','/tmp/test-key','a'*64,'/tmp/test-ca')
            config=config.replace('/tmp/test-cert','"'+cert.as_posix()+'"').replace('/tmp/test-key','"'+key.as_posix()+'"').replace('/tmp/test-ca','"'+cert.as_posix()+'"')
            config=config.replace('listen 80;','listen 127.0.0.1:'+str(http_port)+';').replace('listen 443 ssl;','listen 127.0.0.1:'+str(https_port)+' ssl;')
            config=config.replace('https://182.92.179.81','https://127.0.0.1:'+str(primary.server_port)).replace('http://127.0.0.1:3102','http://127.0.0.1:'+str(reader.server_port))
            config=config.replace('/www/wwwlogs/mooncci-geo-gateway-error.log','"'+(base/'error.log').as_posix()+'"')
            (base/'logs').mkdir();(base/'temp').mkdir()
            (base/'nginx.conf').write_text('worker_processes 1;\nerror_log logs/error.log;\npid logs/nginx.pid;\nevents { worker_connections 128; }\nhttp {\n'+config+'\n}\n')
            args=[str(NGINX),'-p',base.as_posix()+'/', '-c','nginx.conf']
            check=subprocess.run(args+['-t'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            self.assertEqual(check.returncode,0,check.stderr.decode())
            process=subprocess.Popen(args,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            clientctx=ssl.create_default_context(cafile=str(cert));clientctx.check_hostname=False
            def request(path,method='GET',headers=None,body=None):
                c=http.client.HTTPSConnection('127.0.0.1',https_port,context=clientctx,timeout=5)
                c.request(method,path,body=body,headers={'Host':'mooncci.site',**(headers or {})})
                r=c.getresponse();result=(r.status,dict((k.lower(),v) for k,v in r.getheaders()),r.read());c.close();return result
            try:
                for attempt in range(50):
                    try:
                        with socket.create_connection(('127.0.0.1',https_port),timeout=.2):break
                    except OSError:time.sleep(.1)
                status,h,b=request('/',headers={'X-Mooncci-Reader-Key':'client-controlled'})
                self.assertEqual((status,h['x-mooncci-route']),(200,'reader'))
                self.assertNotIn('set-cookie',h)
                self.assertEqual(reader_calls[-1]['headers']['X-Mooncci-Reader-Key'],'a'*64)
                before=len(reader_calls)
                status,h,b=request('/api/posts?page=1',headers={'X-Forwarded-For':'203.0.113.77'})
                self.assertEqual(h['x-mooncci-route'],'primary');self.assertEqual(len(reader_calls),before)
                self.assertEqual(json.loads(b)['headers']['X-Forwarded-For'],'127.0.0.1')
                for header,value in [('Cookie','mooncci_token=opaque'),('Authorization','Bearer opaque'),('Range','bytes=0-10')]:
                    before=len(reader_calls)
                    status,h,b=request('/api/posts',headers={header:value,'Origin':'https://mooncci.site','X-Mooncci-Reader-Key':'client-controlled'})
                    self.assertEqual(h['x-mooncci-route'],'primary');self.assertEqual(len(reader_calls),before)
                    data=json.loads(b);self.assertEqual(data['headers'][header],value)
                    self.assertEqual(data['headers']['Origin'],'https://mooncci.site');self.assertNotIn('X-Mooncci-Reader-Key',data['headers'])
                    self.assertIn('set-cookie',h)
                for method in ('POST','PATCH'):
                    before=len(primary_calls);r_before=len(reader_calls)
                    status,h,b=request('/api/posts',method,{'Content-Type':'application/json','Cookie':'mooncci_token=opaque','Origin':'https://mooncci.site'},'{"value":"preserved"}')
                    self.assertEqual(len(primary_calls),before+1);self.assertEqual(len(reader_calls),r_before)
                    data=json.loads(b);self.assertEqual(data['method'],method);self.assertEqual(data['body'],'{"value":"preserved"}')
                primary_status[0]=503
                before=len(primary_calls);request('/api/posts','POST',body='once');self.assertEqual(len(primary_calls),before+1)
                primary_status[0]=302
                status,h,b=request('/api/auth/github/callback?code=opaque')
                self.assertEqual(status,302);self.assertIn('state=opaque',h['location']);self.assertIn('set-cookie',h)
                primary_status[0]=200;reader_status[0]=503
                before=len(primary_calls);status,h,b=request('/')
                self.assertEqual((status,h['x-mooncci-route']),(200,'primary'));self.assertEqual(len(primary_calls),before+1)
                reader_status[0]=404
                before=len(primary_calls);status,h,b=request('/article/123')
                self.assertEqual(status,404);self.assertEqual(len(primary_calls),before)
                status,h,b=request('/assets/new-version.js');self.assertEqual((status,h['x-mooncci-route']),(200,'primary'))
                self.assertEqual(len(primary_calls),before+1)
            finally:
                subprocess.run(args+['-s','quit'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10)
                process.wait(timeout=10)
                primary.shutdown();reader.shutdown();primary.server_close();reader.server_close()
if __name__=='__main__':unittest.main()
