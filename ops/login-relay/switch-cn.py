#!/usr/bin/env python3
"""Run as root on CN. Scoped URL switch, PM2 persistence, automatic rollback."""
import datetime,json,os,re,shutil,subprocess,time,urllib.request
from pathlib import Path
SERVER=Path("/www/wwwroot/mooncci-source/server")
ENV=SERVER/".env"
NODE="/opt/mooncci-node-v24.20.0/bin/node"
PM2HOME="/home/mooncci/.pm2"
PATH="/opt/mooncci-node-v24.20.0/bin:/usr/local/bin:/usr/bin:/bin"
NEW={"GOOGLE_CERTS_URL":"https://auth-origin.cuegroveapp.com/google-certs",
     "GITHUB_OAUTH_PROXY_URL":"https://auth-origin.cuegroveapp.com"}
def replace_urls(text,values):
    for key,value in values.items():
        pattern=r"(?m)^[ \t]*(?:export[ \t]+)?"+re.escape(key)+r"[ \t]*=[^\r\n]*"
        if re.search(pattern,text):text=re.sub(pattern,key+"="+value,text)
        else:text=text.rstrip("\r\n")+"\n"+key+"="+value+"\n"
    return text
def main():
    if os.geteuid()!=0:raise RuntimeError("Run on CN as root")
    if not ENV.is_file():raise RuntimeError("CN server .env missing")
    if not Path(PM2HOME,"rpc.sock").exists():raise RuntimeError("Existing mooncci PM2 daemon not found")
    base=["runuser","-u","mooncci","--","env","PATH="+PATH,"PM2_HOME="+PM2HOME]
    def pm2(args,values=None):
        proc=subprocess.run(base+[k+"="+v for k,v in (values or {}).items()]+["pm2"]+args,
                            cwd=str(SERVER),stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True,timeout=45)
        if proc.returncode:raise RuntimeError("PM2 operation failed: "+args[0]+" (output suppressed for privacy)")
        return proc.stdout
    def application():
        apps=json.loads(pm2(["jlist"]))
        matches=[x for x in apps if x.get("name")=="mooncci-api"]
        if len(matches)!=1:raise RuntimeError("Expected exactly one mooncci-api process")
        return matches[0]
    current=application()
    if current["pm2_env"].get("status")!="online":raise RuntimeError("Existing API is not online; stop before editing")
    original=ENV.read_bytes();stat=ENV.stat()
    parsed=json.loads(subprocess.check_output([NODE,"-e",
        "const d=require('dotenv'),f=require('fs');process.stdout.write(JSON.stringify(d.parse(f.readFileSync('.env'))))"],
        cwd=str(SERVER),universal_newlines=True))
    pm=current["pm2_env"]
    old={k:str(pm.get(k,parsed.get(k,""))) for k in NEW}
    from urllib.parse import urlsplit
    if any(urlsplit(v).scheme!="https" or not urlsplit(v).hostname for v in old.values()):
        raise RuntimeError("Cannot determine valid old relay URLs; nothing changed")
    key=parsed.get("GITHUB_OAUTH_PROXY_KEY","")
    if not re.fullmatch("[a-f0-9]{64}",key):raise RuntimeError("Invalid existing .env relay key")
    if pm.get("GITHUB_OAUTH_PROXY_KEY",key)!=key:
        raise RuntimeError("PM2 relay key differs from .env used in probes; nothing changed")
    port=int(pm.get("PORT",parsed.get("PORT","3001")))
    if not 1<=port<=65535:raise RuntimeError("Invalid existing port")
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup=Path("/www/backup")/("mooncci-login-switch-"+stamp)
    backup.mkdir(mode=0o700,parents=True);backup.chmod(0o700)
    def private(path,data):
        with open(path,"xb") as f:
            os.fchmod(f.fileno(),0o600);f.write(data)
    private(backup/".env",original)
    private(backup/"previous-urls.json",(json.dumps(old)+"\n").encode())
    # Preserve saved process state for diagnosis, never print it.
    dump=Path(PM2HOME,"dump.pm2")
    if dump.exists():private(backup/"dump.pm2",dump.read_bytes())
    def write_env(data):
        temp=ENV.with_name(".env.login-relay-switch")
        with open(temp,"xb") as f:
            os.fchmod(f.fileno(),stat.st_mode & 0o777)
            os.fchown(f.fileno(),stat.st_uid,stat.st_gid)
            f.write(data);f.flush();os.fsync(f.fileno())
        os.replace(temp,ENV)
    def restart(values):
        pm2(["restart","mooncci-api","--update-env"],values)
        for _ in range(20):
            app=application()
            if app["pm2_env"].get("status")=="online" and all(app["pm2_env"].get(k)==v for k,v in values.items()):
                return
            time.sleep(1)
        raise RuntimeError("API process/env verification failed")
    def health():
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for service in ("google","github"):
            url=f"http://127.0.0.1:{port}/api/health/dependencies/{service}"
            # Retry connection refusal during startup only, never repeat a failed health response.
            for attempt in range(10):
                try:
                    with opener.open(url,timeout=12) as response:
                        result=json.load(response)
                    if result.get("ok") is not True or result.get("service")!=service:
                        raise RuntimeError("Dependency verification failed: "+service)
                    print("PASS: "+service+" application health",flush=True);break
                except urllib.error.URLError as error:
                    if isinstance(error.reason,ConnectionRefusedError) and attempt<9:
                        time.sleep(1);continue
                    raise RuntimeError("Dependency request failed: "+service) from None
    print("Saved backup: "+str(backup),flush=True)
    try:
        write_env(replace_urls(original.decode(),NEW).encode())
        restart(NEW);health()
        pm2(["save"])
        print("PASS: CN API uses US relay; PM2 state saved. Worker unchanged.",flush=True)
        print("Real Google/GitHub browser login still required; monitoring remains enabled.",flush=True)
    except BaseException:
        print("Switch failed; restoring previous configuration.",flush=True)
        write_env(original)
        restart(old)
        pm2(["save"])
        print("ROLLED BACK: old relay URLs restored.",flush=True)
        raise
if __name__=="__main__":
    try:main()
    except Exception as error:
        # No subprocess output, environment values, or credentials.
        print("STOP: "+str(error),flush=True)
        raise SystemExit(1)
