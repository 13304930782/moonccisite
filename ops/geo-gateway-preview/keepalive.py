#!/usr/bin/env python3
"""US only: preserve vhost, add bounded upstream keepalive, validate and rollback."""
import datetime,json,os,re,subprocess,time
from pathlib import Path
VHOST=Path("/www/server/panel/vhost/nginx/mooncci.site.conf")
NGINX="/www/server/nginx/sbin/nginx"
GROUP="mooncci_cn_tls_pool"
BLOCK="""# Mooncci US -> CN persistent TLS connections; no response caching.
upstream mooncci_cn_tls_pool {
    server 182.92.179.81:443;
    keepalive 16;
    keepalive_requests 1000;
    keepalive_timeout 30s;
}
"""
def patch(text):
    if GROUP in text:raise ValueError("Connection pool already present; no changes made")
    required=['proxy_http_version 1.1;','proxy_set_header Connection "";',
              'proxy_ssl_server_name on;','proxy_ssl_name mooncci.site;',
              'proxy_ssl_verify on;','proxy_next_upstream off;']
    for directive in required:
        if text.count(directive)<2:raise ValueError("Expected gateway safety directive missing: "+directive)
    new,count=re.subn(r'(?m)^([ \t]*)proxy_pass https://182\.92\.179\.81;[ \t]*$',
                     r'\1proxy_pass https://mooncci_cn_tls_pool;',text)
    if count!=2:raise ValueError("Expected exactly two CN proxy routes")
    return BLOCK+new
def run(args):
    subprocess.run([str(a) for a in args],check=True)
def sample(label,count):
    records=[]
    for i in range(count):
        args=["curl","--noproxy","*","--resolve","mooncci.site:443:127.0.0.1",
              "--silent","--show-error","--fail","--connect-timeout","3","--max-time","15",
              "--write-out","\n%{http_code} %{time_starttransfer} %{time_total}",
              "https://mooncci.site/api/health/dependencies/google"]
        r=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True)
        if r.returncode:raise RuntimeError("Local US gateway probe failed; curl exit "+str(r.returncode))
        body,timing=r.stdout.rsplit("\n",1);data=json.loads(body)
        if data.get("ok") is not True or data.get("service")!="google":
            raise RuntimeError("Application health response failed")
        code,first,total=timing.split()
        row={"phase":label,"sample":i+1,"http":code,"firstByteSeconds":float(first),
             "totalSeconds":float(total),"checkedAt":data.get("checkedAt"),"probeMs":data.get("responseTimeMs")}
        records.append(row);print(json.dumps(row),flush=True)
        time.sleep(1)
    return records
def main():
    if os.geteuid()!=0:raise RuntimeError("Run as root on US")
    if not Path("/etc/systemd/system/mooncci-login-relay.service").exists():
        raise RuntimeError("US login relay service missing; verify host")
    original=VHOST.read_bytes();updated=patch(original.decode()).encode()
    run([NGINX,"-t"])
    # Baseline isolates the US -> CN forward leg; no CN -> US client journey.
    sample("before",8)
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup=Path("/www/backup")/("mooncci-gateway-keepalive-"+stamp)
    backup.mkdir(mode=0o700,parents=True);backup.chmod(0o700)
    with open(backup/"mooncci.site.conf","xb") as f:
        os.fchmod(f.fileno(),0o600);f.write(original)
    print("Saved backup: "+str(backup),flush=True)
    stat=VHOST.stat()
    def write(body):
        tmp=VHOST.with_name("mooncci.site.keepalive-tmp")
        with open(tmp,"xb") as f:
            os.fchmod(f.fileno(),stat.st_mode & 0o777)
            os.fchown(f.fileno(),stat.st_uid,stat.st_gid)
            f.write(body);f.flush();os.fsync(f.fileno())
        os.replace(tmp,VHOST)
    try:
        write(updated);run([NGINX,"-t"]);run([NGINX,"-s","reload"])
        time.sleep(3)
        sample("after",8)
        print("PASS: connection pool installed; HTTPS and application health passed.",flush=True)
        print("Compare timings with equal checkedAt; network latency and cold connections remain.",flush=True)
    except BaseException:
        write(original);run([NGINX,"-t"]);run([NGINX,"-s","reload"])
        print("ROLLED BACK: original gateway configuration restored.",flush=True)
        raise
if __name__=="__main__":
    try:main()
    except Exception as error:
        print("STOP: "+str(error),flush=True);raise SystemExit(1)
