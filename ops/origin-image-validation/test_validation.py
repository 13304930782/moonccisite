import http.client,socket,subprocess,tempfile,threading,time,unittest
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from patch import patch
ROOT=Path(__file__).resolve().parents[2]
NGINX=ROOT/'.cache/nginx-test/nginx-1.28.0/nginx.exe'
class ValidationTest(unittest.TestCase):
 def test_real_nginx(self):
  seen=[]
  class Handler(BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def do_GET(self):
    seen.append(dict(self.headers))
    valid=self.headers.get('If-None-Match')=='W/"fixture"' or self.headers.get('If-Modified-Since')=='Sat, 26 Sep 2026 17:12:14 GMT'
    self.send_response(304 if valid else 200)
    self.send_header('ETag','W/"fixture"');self.send_header('Last-Modified','Sat, 26 Sep 2026 17:12:14 GMT');self.send_header('Cache-Control','public, max-age=0')
    if not valid:self.send_header('Content-Length','5')
    self.end_headers()
    if not valid:self.wfile.write(b'image')
  upstream=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=upstream.serve_forever,daemon=True).start()
  with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
  template='server { listen 127.0.0.1:%d;\n location ^~ /api/uploads/ {\n if ($request_method = OPTIONS) {\n return 204;\n }\n add_header X-Fixture "{quoted}";\n # comment with } and {\n proxy_pass http://127.0.0.1:3001;\n }\n location /api/ { return 403; }\n}\n'%port
  try:
   for changed in (False,True):
    with tempfile.TemporaryDirectory(dir=ROOT/'.cache') as directory:
     base=Path(directory);(base/'logs').mkdir();(base/'temp').mkdir()
     config=(patch(template) if changed else template).replace('127.0.0.1:3001','127.0.0.1:'+str(upstream.server_port))
     config='worker_processes 1;\nevents { worker_connections 64; }\nhttp { proxy_cache_path cache keys_zone=cache_one:1m; proxy_cache cache_one;\n'+config+'}\n'
     (base/'nginx.conf').write_bytes(config.encode());args=[str(NGINX),'-p',base.as_posix()+'/', '-c','nginx.conf']
     result=subprocess.run(args+['-t'],capture_output=True);self.assertEqual(result.returncode,0,result.stderr)
     proc=subprocess.Popen(args,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
     try:
      for _ in range(40):
       try:
        with socket.create_connection(('127.0.0.1',port),timeout=.2):break
       except OSError:time.sleep(.1)
      def get(headers={},path='/api/uploads/test.webp',method='GET'):
       c=http.client.HTTPConnection('127.0.0.1',port,timeout=5);c.request(method,path,headers=headers);r=c.getresponse();data=r.read();c.close();return r.status,len(data)
      self.assertEqual(get(method='OPTIONS'),(204,0))
      self.assertEqual(get(),(200,5))
      for h,v in [('If-None-Match','W/"fixture"'),('If-Modified-Since','Sat, 26 Sep 2026 17:12:14 GMT')]:
       result=get({h:v});self.assertEqual(result,(304,0) if changed else (200,5));self.assertEqual(h in seen[-1],changed)
       print('patched',changed,h,result)
      self.assertEqual(get({'If-None-Match':'W/"different"'}),(200,5))
      self.assertEqual(get(path='/api/private')[0],403)
     finally:subprocess.run(args+['-s','quit'],capture_output=True);proc.wait(timeout=10)
  finally:upstream.shutdown();upstream.server_close()
 def test_guard(self):
  text='location ^~ /api/uploads/ {\nproxy_pass http://127.0.0.1:3001;\n}\n'
  self.assertEqual(patch(text).count('proxy_cache off;'),1)
  for bad in [patch(text),text+text,text.replace('3001','3102'),text.replace('proxy_pass','include x; proxy_pass')]:
   with self.assertRaises(ValueError):patch(bad)
 def test_structural_preservation(self):
  text="""server {
 location ^~ /api/uploads/ {
  if ($request_method = OPTIONS) {
   add_header X-Literal "brace } # not comment";
   return 204;
  }
  # ignored } {
  proxy_set_header Host ${host};
  proxy_pass http://127.0.0.1:3001;
 }
 location /api/ { return 403; }
}
"""
  added='\n     # mooncci: preserve upload validators\n     proxy_cache off;'
  updated=patch(text)
  self.assertEqual(updated.replace(added,'',1),text)
  for bad in [text.replace('if ($request_method = OPTIONS)','location /nested'),text.replace('return 204;', 'proxy_cache cache_one;'),text[:text.index('\n }\n location /api/')],text.replace('proxy_pass http://127.0.0.1:3001;', 'include extra.conf;')]:
   with self.assertRaises(ValueError):patch(bad)
if __name__=='__main__':unittest.main()
