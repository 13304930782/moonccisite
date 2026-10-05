import sys,re,json,hashlib,subprocess,tempfile,os,shutil,time,fcntl
from pathlib import Path
SITE=Path('/www/server/panel/vhost/nginx/mooncci.site.conf')
NGINX='/www/server/nginx/sbin/nginx'
OLD='''        set $mooncci_geo_asset $mooncci_geo_public;
        if ($uri !~ ^/assets/) { set $mooncci_geo_asset 0; }
'''
NEW=OLD+'''        # Published hashed JS/CSS are identical for every visitor. Reader strips cookies.
        if ($request_uri ~ "^/assets/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,16}\\.(?:js|css)$") { set $mooncci_geo_asset 1; }
        if ($request_method !~ ^(GET|HEAD)$) { set $mooncci_geo_asset 0; }
        if ($http_authorization != "") { set $mooncci_geo_asset 0; }
        if ($http_proxy_authorization != "") { set $mooncci_geo_asset 0; }
        if ($http_range != "") { set $mooncci_geo_asset 0; }
'''
def sha(data):return hashlib.sha256(data).hexdigest()
def candidate(data):
 text=data.decode()
 if text.count(OLD)!=1 or 'Published hashed JS/CSS' in text:raise ValueError('Reviewed routing block changed')
 return text.replace(OLD,NEW,1).encode()
def atomic(data):
 p=SITE.with_name(SITE.name+'.static-tmp');p.write_bytes(data);shutil.copystat(str(SITE),str(p));s=SITE.stat();os.chown(str(p),s.st_uid,s.st_gid);os.replace(str(p),str(SITE))
def nginx(*args):
 p=subprocess.run([NGINX]+list(args),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if p.returncode:raise RuntimeError('nginx command failed')
def restore(backup):
 backup=backup.resolve()
 if backup.parent!=Path('/www/backup') or not backup.name.startswith('mooncci-static-cookie.'):raise ValueError('Unexpected backup')
 m=json.loads((backup/'manifest.json').read_text());before=(backup/'site.before').read_bytes()
 if sha(before)!=m['before'] or sha(SITE.read_bytes()) not in (m['before'],m['after']):raise ValueError('Config drift; refusing overwrite')
 current=SITE.read_bytes();atomic(before)
 try:nginx('-t');nginx('-s','reload')
 except:atomic(current);raise
 print(json.dumps({'restored':str(backup)}))
def request(url,extra=(),head=False):
 with tempfile.TemporaryDirectory() as t:
  t=Path(t)
  cmd=['curl','--noproxy','*','--http2','--resolve','mooncci.site:443:127.0.0.1','--max-time','15','-sS','-D',str(t/'headers'),'-o',str(t/'body'),'-w','%{http_code} %{time_starttransfer}']
  if head:cmd+=['-I']
  p=subprocess.run(cmd+list(extra)+['https://mooncci.site'+url],stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True)
  if p.returncode:raise RuntimeError('HTTPS request failed')
  headers={}
  for s in (t/'headers').read_text().splitlines():
   k,_,v=s.partition(':')
   if k.lower() in ('x-mooncci-route','cache-control','content-type'):headers[k.lower()]=v.strip()
  return {'status':int(p.stdout.split()[0]),'ttfb_s':float(p.stdout.split()[1]),'headers':headers,'sha256':sha((t/'body').read_bytes())}
def verify():
 results=[]
 for name,expected in [('AccountWorkspace-BHatozJw.js','e9be3e036634c6ecfc108659c948b448824295b2aac69c7d41e3bd4494f90ac7'),('MailboxPage-B7Xx1OaK.js','e7b6d8f6dfdfda4f6fa2bb7f7069cce46cd7681ce269d8c72f484aac162b4e31')]:
  for cookie in (False,True):
   r=request('/assets/'+name,['-H','Cookie: mooncci_diagnostic_probe=1'] if cookie else [])
   if r['status']!=200 or r['sha256']!=expected or r['headers'].get('x-mooncci-route')!='reader' or 'immutable' not in r['headers'].get('cache-control',''):raise RuntimeError('Public static verification failed')
   results.append({'asset':name,'dummy_cookie':cookie,**r})
 # Authenticated/private routes and explicit Authorization remain on the primary.
 for url,extra in [('/api/mailboxes/me',['-H','Cookie: mooncci_diagnostic_probe=1']),('/assets/AccountWorkspace-BHatozJw.js',['-H','Authorization: Bearer diagnostic-invalid']),('/assets/AccountWorkspace-BHatozJw.js?diagnostic=1',['-H','Cookie: mooncci_diagnostic_probe=1'])]:
  r=request(url,extra)
  if r['headers'].get('x-mooncci-route')!='primary':raise RuntimeError('Private route boundary failed')
  if url.startswith('/api/mailboxes') and r['status']!=401:raise RuntimeError('Mailbox authentication boundary failed')
 return results
def main():
 mode=sys.argv[1]
 if mode=='rollback':restore(Path(sys.argv[2]));return
 before=SITE.read_bytes();after=candidate(before)
 if mode=='preview':print(json.dumps({'before':sha(before),'after':sha(after),'diff':NEW[len(OLD):]}));return
 if mode!='apply' or sha(before)!=sys.argv[2]:raise ValueError('Reviewed SHA required')
 nginx('-t');b=Path(tempfile.mkdtemp(prefix='mooncci-static-cookie.',dir='/www/backup'));(b/'site.before').write_bytes(before);(b/'manifest.json').write_text(json.dumps({'before':sha(before),'after':sha(after)}))
 try:
  atomic(after);nginx('-t');nginx('-s','reload');time.sleep(1);results=verify()
 except:restore(b);raise
 print(json.dumps({'installed':True,'backup':str(b),'checks':results}))
if __name__=='__main__':
 with open('/tmp/mooncci-static-cookie.lock','w') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX);main()
