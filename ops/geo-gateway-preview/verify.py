"""Pinned HTTPS acceptance; no real credentials or successful write requests."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import secrets
HOST='mooncci.site'

def request(ip,path,extra=None):
    with tempfile.TemporaryDirectory(prefix='mooncci-verify-') as temp:
        h=Path(temp)/'h';b=Path(temp)/'b'
        r=subprocess.run(['curl','--noproxy','*','-sS','--max-time','25','--resolve',HOST+':443:'+ip,
            '-D',str(h),'-o',str(b),'-w','%{http_code}',*(extra or []),'https://'+HOST+path],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
        if r.returncode:raise RuntimeError('HTTPS request failed; curl exit '+str(r.returncode))
        headers={}
        for line in h.read_text(encoding='iso-8859-1').splitlines():
            if ':' in line:
                k,v=line.split(':',1);headers[k.lower()]=v.strip()
        return int(r.stdout),headers,b.read_bytes()

def verify_origin_ip():
    code,h,b=request('182.92.179.81','/_mooncci_gateway_ip_check',['-H','X-Forwarded-For: 203.0.113.77'])
    if code!=200 or b.strip()!=b'203.0.113.77':raise RuntimeError('CN trusted-gateway IP check failed; install CN patch first')
    octet=secrets.randbelow(250)+1
    ips=['198.18.'+str(octet)+'.10','198.18.'+str(octet)+'.11']
    counts=[]
    for ip in [ips[0],ips[1],ips[0]]:
        code,h,b=request('182.92.179.81','/api/posts?format=paged&page=1&pageSize=1',['-H','X-Forwarded-For: '+ip])
        if code!=200 or 'ratelimit-remaining' not in h:raise RuntimeError('Rate limit verification unavailable')
        counts.append(int(h['ratelimit-remaining']))
    if counts[0]!=counts[1] or counts[2]!=counts[0]-1:raise RuntimeError('Independent per-client rate-limit check failed; no rollout')
    print('PASS trusted gateway IP and independent API rate-limit buckets',flush=True)

def verify(region='US',ip='107.174.123.42'):
    if region!='US':raise ValueError('US only')
    verify_origin_ip()
    public='/api/posts?format=paged&page=1&pageSize=1'
    cases=[('public',public,200,'primary',[]),
        ('cookie',public,200,'primary',['-H','Cookie: geo_probe=1']),
        ('authorization',public,200,'primary',['-H','Authorization: Bearer invalid-geo-probe']),
        ('providers','/api/auth/providers',200,'primary',[]),
        ('account-page','/account/bookmarks',200,'primary',[]),
        ('auth-denied','/api/auth/me',401,'primary',[]),
        ('csrf-denied','/api/posts',403,'primary',['-X','POST','-H','Content-Type: application/json','--data','{}']),
        ('origin-denied','/api/posts',403,'primary',['-X','POST','-H','Content-Type: application/json','-H','X-Requested-With: XMLHttpRequest','-H','Origin: https://invalid.example','--data','{}']),
        ('write-auth-denied','/api/posts',401,'primary',['-X','POST','-H','Content-Type: application/json','-H','X-Requested-With: XMLHttpRequest','-H','Origin: https://mooncci.site','--data','{}'])]
    for label,path,expected,route,extra in cases:
        code,h,b=request(ip,path,extra)
        if code!=expected or h.get('x-mooncci-node')!='US' or h.get('x-mooncci-route')!=route:
            raise RuntimeError(label+' failed: HTTP='+str(code)+' route='+h.get('x-mooncci-route','missing'))
        print('PASS '+label+' HTTP='+str(code)+' route='+route,flush=True)
    code,h,body=request(ip,public)
    other=request('182.92.179.81',public)[2]
    if json.loads(body)!=json.loads(other):raise RuntimeError('Public data differ; recheck concurrent publication')
    print('PASS public-data-equality',flush=True)
    code,h,home=request(ip,'/')
    if code!=200 or h.get('x-mooncci-route')!='reader':raise RuntimeError('Homepage route mismatch')
    assets=set(re.findall(r'/assets/[A-Za-z0-9_-]+\.(?:js|css)',home.decode('utf-8')))
    if not assets:raise RuntimeError('Homepage contains no entry assets')
    for asset in sorted(assets):
        code,headers,body=request(ip,asset)
        primary_code,_,other=request('182.92.179.81',asset)
        if code!=200 or primary_code!=200 or body!=other:raise RuntimeError('Asset differs: '+asset)
        print('PASS asset-bytes '+asset+' sha256='+hashlib.sha256(body).hexdigest(),flush=True)
    print('Automated acceptance passed. Real browser login/write and remote client performance remain unverified.',flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--ip',default='107.174.123.42');a=p.parse_args()
    verify(ip=a.ip)
