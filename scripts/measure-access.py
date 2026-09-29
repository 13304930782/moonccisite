"""Read-only HTTPS timing probe. Run separately at each vantage point; no cookies or credentials."""
import argparse, datetime, hashlib, json, socket, ssl, time, urllib.parse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--connect-ip');p.add_argument('--label',required=True);p.add_argument('--samples',type=int,default=30);p.add_argument('--output',required=True)
a=p.parse_args();u=urllib.parse.urlsplit(a.url)
if u.scheme!='https' or u.username or u.password: p.error('Use an HTTPS URL without credentials')
rows=[];etag=None
for index in range(a.samples):
 start=time.perf_counter();row={'sample':index+1,'vantage':a.label,'url':a.url,'connect_ip':a.connect_ip,'cache_mode':'conditional' if index%2 and etag else 'unconditional','utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 try:
  addresses=socket.getaddrinfo(a.connect_ip or u.hostname,u.port or 443,type=socket.SOCK_STREAM);row['dns_s']=time.perf_counter()-start
  family,kind,proto,_,address=addresses[0]
  with socket.socket(family,kind,proto) as raw:
   raw.settimeout(20);raw.connect(address);row['tcp_s']=time.perf_counter()-start
   with ssl.create_default_context().wrap_socket(raw,server_hostname=u.hostname) as conn:
    row['tls_s']=time.perf_counter()-start
    target=urllib.parse.urlunsplit(('', '',u.path or '/',u.query,''))
    extra=('If-None-Match: '+etag+'\r\n') if row['cache_mode']=='conditional' else ''
    conn.sendall(('GET '+target+' HTTP/1.1\r\nHost: '+u.netloc+'\r\nConnection: close\r\nUser-Agent: mooncci-readonly-performance/1\r\n'+extra+'\r\n').encode())
    data=conn.recv(1);row['first_s']=time.perf_counter()-start
    while True:
     block=conn.recv(65536)
     if not block:break
     data+=block
     if len(data)>12*1024*1024:raise ValueError('12 MiB response limit')
    header,body=data.split(b'\r\n\r\n',1);lines=header.decode('iso-8859-1').split('\r\n');row['status']=int(lines[0].split()[1]);headers=dict(line.split(': ',1) for line in lines[1:] if ': ' in line);headers={k.lower():v for k,v in headers.items()}
    etag=headers.get('etag',etag);row['headers']={k:headers[k] for k in ['content-type','content-length','cache-control','etag','age','via','x-cache','transfer-encoding'] if k in headers};row['bytes']=len(body);row['sha256']=hashlib.sha256(body).hexdigest();row['prefix_hex']=body[:16].hex()
 except Exception as e:row['error']=type(e).__name__+': '+str(e)
 row['total_s']=time.perf_counter()-start;rows.append(row)
out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes((json.dumps(rows,ensure_ascii=False,indent=2)+'\n').encode());print(json.dumps({'output':str(out),'samples':len(rows),'errors':sum('error' in r or r.get('status',0)>=400 for r in rows)}))
