"""Run on China origin. Read-only loopback requests; no credentials/configuration output."""
import argparse
import datetime
import http.client
import json
import socket
import ssl
from pathlib import Path

IMAGE='/api/uploads/import-c75fb0e91471-bfafc384e05b5c98e6e9.webp'
SAFE={'etag','last-modified','cache-control','content-type','content-length','server','x-mooncci-node','x-mooncci-route'}

class LocalTLS(http.client.HTTPSConnection):
    def connect(self):
        raw=socket.create_connection(('127.0.0.1',443),timeout=self.timeout)
        try: self.sock=self._context.wrap_socket(raw,server_hostname=self.host)
        except BaseException: raw.close(); raise

def request(layer,extra):
    conn=LocalTLS('mooncci.site',timeout=12) if layer=='nginx' else http.client.HTTPConnection('127.0.0.1',3001,timeout=12)
    try:
        conn.request('GET',IMAGE,headers={'Host':'mooncci.site','Connection':'close',**extra})
        response=conn.getresponse(); body=response.read(2097153)
        if len(body)>2097152: raise ValueError('Response exceeds 2 MiB limit')
        return {'status':response.status,'bytes':len(body),'headers':{k.lower():v for k,v in response.getheaders() if k.lower() in SAFE}}
    finally: conn.close()

def collect():
    report={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'vantage':'China server loopback','results':[]}
    for layer in ['backend','nginx']:
        for attempt in range(1,4):
            item={'layer':layer,'attempt':attempt};report['results'].append(item)
            try:
                first=request(layer,{}); item['baseline']=first
                headers=first['headers']
                if first['status']!=200: item['error']='Baseline not 200';break
                for mode,name,key in [('etag','If-None-Match','etag'),('modified','If-Modified-Since','last-modified')]:
                    if key in headers: item[mode]=request(layer,{name:headers[key]})
                    else: item[mode]={'skipped':'Missing '+key}
            except (OSError,ValueError,http.client.HTTPException) as error:
                item['error']=str(error);break
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',default='/root/mooncci-image-validation.json');args=parser.parse_args()
    report=collect()
    Path(args.output).write_bytes((json.dumps(report,ensure_ascii=False,indent=2)+'\n').encode())
    print('TEST_DONE '+args.output)
