"""Read-only filtered Nginx inspection. No raw config, environment, cookie or auth values."""
import json
import re
import subprocess
from pathlib import Path

ALLOW=re.compile(r'^(?:server_name|listen|location|include|if_modified_since|etag|expires|proxy_cache(?:_[a-z_]+)?|proxy_pass_request_headers|proxy_hide_header|proxy_pass_header|proxy_set_header\s+(?:If-None-Match|If-Modified-Since|Cache-Control|Pragma)|more_clear_input_headers|more_set_input_headers|rewrite_by_lua_file|access_by_lua_file)\b',re.I)

def filtered(text):
    source=''; rows=[]
    for number,line in enumerate(text.splitlines(),1):
        if line.startswith('# configuration file '): source=line[len('# configuration file '):].rstrip(':')
        value=line.strip()
        if not ALLOW.match(value): continue
        # Never include trailing inline directives (which could contain credentials).
        if value.lower().startswith('location '): value=value.split('{',1)[0].strip()+' {'
        else: value=value.split(';',1)[0]+';'
        # Only forward the validator/cache header values; other header manipulation is redacted.
        if re.match(r'more_(?:clear|set)_input_headers',value,re.I):
            value=value.split()[0]+' [header rule present; value withheld]'
        rows.append({'source':source,'dump_line':number,'directive':value})
    return rows

if __name__=='__main__':
    p=subprocess.run(['/www/server/nginx/sbin/nginx','-T'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True,timeout=30)
    report={'nginx_exit':p.returncode,'directives':filtered(p.stdout) if p.returncode==0 else [],'note':'Filtered directives only; full config and stderr withheld'}
    target=Path('/root/mooncci-image-proxy.json')
    target.write_bytes((json.dumps(report,ensure_ascii=False,indent=2)+'\n').encode())
    print('TEST_DONE '+str(target))
