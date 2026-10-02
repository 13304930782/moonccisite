#!/usr/bin/env python3
"""First installation only: isolated service and dedicated hostname."""
import hashlib, json, os, re, shutil, socket, subprocess, sys, time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
HOST="auth-origin.cuegroveapp.com"
IP="107.174.123.42"
NODE=Path("/www/server/nodejs/v22.23.1/bin/node")
NGINX="/www/server/nginx/sbin/nginx"
VHOST=Path("/www/server/panel/vhost/nginx")/(HOST+".conf")
UNIT=Path("/etc/systemd/system/mooncci-login-relay.service")
ENV=Path("/etc/mooncci-login-relay.env")
WEB=Path("/www/wwwroot")/HOST
DEST=Path("/opt/mooncci-login-relay")
CERT=Path("/etc/letsencrypt/live")/HOST
HOOK=Path("/etc/letsencrypt/renewal-hooks/deploy/mooncci-login-relay")
def run(args):
    subprocess.run([str(x) for x in args],check=True)
def verify_https():
    # nginx -s reload only signals the master; new TLS workers may not be ready yet.
    args=["curl","--noproxy","*","--resolve",HOST+":443:127.0.0.1",
          "--fail","--silent","--show-error","--connect-timeout","2","--max-time","12",
          "-o","/dev/null","https://"+HOST+"/google-certs"]
    for attempt in range(1,9):
        result=subprocess.run(args,capture_output=True,text=True)
        if result.returncode==0:
            print("PASS: strict HTTPS verification",flush=True)
            return
        print(f"HTTPS readiness {attempt}/8: curl exit {result.returncode}",flush=True)
        if attempt<8:time.sleep(2)
    print(result.stderr,flush=True)
    # Public certificate metadata only, retained in the install log before rollback.
    subprocess.run(["openssl","x509","-in",str(CERT/"fullchain.pem"),
                    "-noout","-subject","-issuer","-ext","subjectAltName"])
    try:
        served=subprocess.run(["openssl","s_client","-connect","127.0.0.1:443",
                               "-servername",HOST],input="",capture_output=True,text=True,timeout=5)
        subprocess.run(["openssl","x509","-noout","-subject","-issuer","-ext","subjectAltName"],
                       input=served.stdout,text=True)
    except subprocess.TimeoutExpired:
        print("TLS metadata collection timed out",flush=True)
    raise RuntimeError("HTTPS readiness failed with certificate verification enabled")

def write(path,text,mode=0o644):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(text.encode());path.chmod(mode)
def config(tls=False):
    acme=f"location ^~ /.well-known/acme-challenge/ {{ root {WEB}; }}\n"
    http=f"server {{ listen 80; server_name {HOST};\n{acme}location / {{ return 404; }}\n}}\n"
    if not tls:return http
    locations=""
    for route in ("google-certs","token","user","emails"):
        locations+=f"""location = /{route} {{
 allow 182.92.179.81; allow 127.0.0.1; allow {IP}; deny all;
 proxy_pass http://127.0.0.1:3103;
 proxy_http_version 1.1;
 proxy_set_header Connection "";
 proxy_set_header Host {HOST};
 proxy_connect_timeout 2s; proxy_read_timeout 12s; proxy_send_timeout 12s;
 proxy_next_upstream off;
 proxy_cache off;
}}\n"""
    return http+f"""server {{
 listen 443 ssl; server_name {HOST};
 ssl_certificate {CERT}/fullchain.pem;
 ssl_certificate_key {CERT}/privkey.pem;
 ssl_protocols TLSv1.2 TLSv1.3;
 client_max_body_size 16k; client_body_timeout 10s;
 access_log off;
 {locations}
 location / {{ return 404; }}
}}
"""
def main():
    if os.geteuid()!=0:raise RuntimeError("Run as root")
    manifest=json.loads((ROOT/"manifest.json").read_text())
    for name,digest in manifest.items():
        if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=digest:
            raise RuntimeError("Package checksum mismatch: "+name)
    for path in (VHOST,UNIT,ENV,DEST,WEB,HOOK):
        if path.exists():raise RuntimeError("First install refuses existing path: "+str(path))
    if not NODE.exists():raise RuntimeError("Expected Node binary missing")
    version=subprocess.check_output([str(NODE),"-p","process.versions.node"],text=True).strip()
    if int(version.split(".")[0])<22:raise RuntimeError("Node 22+ required")
    run([NGINX,"-t"])
    if not shutil.which("certbot"):raise RuntimeError("Existing certbot installation required")
    addresses={x[4][0] for x in socket.getaddrinfo(HOST,443,type=socket.SOCK_STREAM)}
    if addresses!={IP}:raise RuntimeError("DNS must resolve only to US IPv4 "+IP+": "+str(addresses))
    with socket.socket() as probe:probe.bind(("127.0.0.1",3103))
    secret=Path("/root/mooncci-login-relay.env")
    if secret.stat().st_mode & 0o077:raise RuntimeError("chmod 600 /root/mooncci-login-relay.env first")
    data=secret.read_text().strip()
    if not re.fullmatch(r"GITHUB_OAUTH_PROXY_KEY=[a-f0-9]{64}",data):
        raise RuntimeError("Secret file must contain only GITHUB_OAUTH_PROXY_KEY=<64 lowercase hex>")
    # All preflight validation above is read-only.
    created=[]
    try:
        DEST.mkdir(parents=True);created.append(DEST)
        for name in ("server.mjs","github-worker.mjs","google-cache.mjs"):
            shutil.copyfile(ROOT/name,DEST/name)
        write(ENV,data+"\n",0o600);created.append(ENV)
        write(UNIT,f"""[Unit]
Description=Mooncci login upstream relay
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
DynamicUser=yes
WorkingDirectory={DEST}
EnvironmentFile={ENV}
ExecStart={NODE} --max-old-space-size=96 {DEST}/server.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
MemoryMax=256M
TasksMax=64
UMask=0077
[Install]
WantedBy=multi-user.target
""");created.append(UNIT)
        run(["systemctl","daemon-reload"])
        run(["systemctl","enable","--now",UNIT.name])
        run(["systemctl","is-active","--quiet",UNIT.name])
        run(["curl","--noproxy","*","--retry","3","--retry-connrefused","--retry-delay","1",
             "--fail","--silent","--show-error","--max-time","12",
             "-o","/dev/null","http://127.0.0.1:3103/google-certs"])
        WEB.mkdir(parents=True);created.append(WEB)
        write(VHOST,config());created.append(VHOST)
        run([NGINX,"-t"]);run([NGINX,"-s","reload"])
        run(["certbot","certonly","--webroot","-w",WEB,"-d",HOST,"--cert-name",HOST,
             "--non-interactive","--agree-tos","--register-unsafely-without-email","--keep-until-expiring"])
        write(VHOST,config(True));run([NGINX,"-t"]);run([NGINX,"-s","reload"])
        verify_https()
        write(HOOK,f"""#!/bin/sh
[ "$RENEWED_LINEAGE" = "{CERT}" ] || exit 0
{NGINX} -t && {NGINX} -s reload
""",0o755);created.append(HOOK)
        run(["systemctl","enable","--now","certbot.timer"])
        print("PASS: US relay and HTTPS public-key request. CN configuration NOT changed.")
        print("Next: CN repeated authenticated probes and real login acceptance.")
    except BaseException:
        subprocess.run(["systemctl","disable","--now",UNIT.name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        for path in reversed(created):
            if path.is_dir():shutil.rmtree(path)
            else:path.unlink(missing_ok=True)
        subprocess.run(["systemctl","daemon-reload"])
        if subprocess.run([NGINX,"-t"]).returncode==0:subprocess.run([NGINX,"-s","reload"])
        print("Installation rolled back; any issued certificate retained.",file=sys.stderr)
        raise
if __name__=="__main__":main()
