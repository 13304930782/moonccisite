#!/usr/bin/env python3
import json,re,time,urllib.request,urllib.error,sys
from pathlib import Path
host="https://auth-origin.cuegroveapp.com"
env=Path("/www/wwwroot/mooncci-source/server/.env").read_text()
match=re.search(r"(?m)^GITHUB_OAUTH_PROXY_KEY\s*=\s*['\"]?([a-f0-9]{64})['\"]?\s*$",env)
if not match:raise SystemExit("Missing key in CN .env; no requests sent")
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
failed=0
for n in range(30):
    for service,path in (("google","/google-certs"),("github","/user")):
        headers={}
        if service=="github":
            headers={"X-Mooncci-Proxy-Key":match[1],"Authorization":"Bearer intentionally_invalid_probe"}
        request=urllib.request.Request(host+path,headers=headers)
        started=time.monotonic()
        try:
            try:response=opener.open(request,timeout=12)
            except urllib.error.HTTPError as error:response=error
            with response:
                if service=="google":
                    data=json.loads(response.read(262145))
                    ok=response.code==200 and isinstance(data,dict) and bool(data) and all(
                        isinstance(v,str) and "BEGIN CERTIFICATE" in v for v in data.values())
                else:
                    ok=(response.code==401 and
                        response.headers.get("X-Mooncci-Proxy-Diagnostic")=="upstream_http_401" and
                        response.headers.get("X-Mooncci-Proxy-Version")=="3")
            label="PASS" if ok else "FAIL response"
        except Exception:
            ok=False;label="FAIL transport"
        failed+=not ok
        print(f"{n+1:02d} {service} {label} elapsed={time.monotonic()-started:.3f}s",flush=True)
    if n<29:time.sleep(5)
print(f"Connectivity sample complete: failures={failed}/60. Real login still required.",flush=True)
sys.exit(1 if failed else 0)
