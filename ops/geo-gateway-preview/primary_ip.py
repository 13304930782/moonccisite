import re
MARK='# mooncci US proxy trust v1'
PROBE='/_mooncci_gateway_ip_check'
BLOCK=r'''
    # mooncci US proxy trust v1
    set_real_ip_from 107.174.123.42;
    real_ip_header X-Forwarded-For;
    real_ip_recursive off;
    location = /_mooncci_gateway_ip_check {
        if ($realip_remote_addr !~ "^(107\.174\.123\.42|127\.0\.0\.1)$") { return 404; }
        default_type text/plain;
        return 200 "$remote_addr";
    }
'''
TOKEN=re.compile(r'#[^\n]*|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|[^\s{};#]+|[{};]')
def patch(text):
    if MARK in text:raise ValueError('Already patched; use verify mode')
    if re.search(r'(?m)^\s*(set_real_ip_from|real_ip_header|real_ip_recursive)\b',text):raise ValueError('Existing real-IP settings need review')
    if PROBE in text:raise ValueError('Probe location already exists')
    tokens=[m for m in TOKEN.finditer(text) if not m.group().startswith('#')]
    stack=[];pairs={}
    for i,t in enumerate(tokens):
        if t.group()=='{':stack.append(i)
        if t.group()=='}':
            if not stack:raise ValueError('Unbalanced configuration')
            pairs[stack.pop()]=i
    if stack:raise ValueError('Unbalanced configuration')
    edits=[]
    for i,t in enumerate(tokens[:-1]):
        if t.group()!='server' or tokens[i+1].group()!='{':continue
        start=i+1;end=pairs[start];j=start+1;names=[]
        while j<end:
            if tokens[j].group()=='{':j=pairs[j]+1;continue
            if tokens[j].group()=='server_name':
                j+=1
                while tokens[j].group()!=';':names.append(tokens[j].group().strip(chr(34)+chr(39)));j+=1
            j+=1
        if 'mooncci.site' not in names:continue
        if not set(names)<=set(['mooncci.site','www.mooncci.site']):raise ValueError('Mixed server names')
        a=tokens[start].end();b=tokens[end].start();inner=text[a:b]
        forwarded=re.findall(r'proxy_set_header\s+X-Forwarded-For\s+([^;]+);',inner)
        if not forwarded or any(v.strip()!='$proxy_add_x_forwarded_for' for v in forwarded):raise ValueError('Unexpected forwarding rules')
        inner=re.sub(r'(proxy_set_header\s+X-Forwarded-For\s+)\$proxy_add_x_forwarded_for;',r'\1$remote_addr;',inner)
        edits.append((a,b,BLOCK+inner))
    if not edits:raise ValueError('Main server block missing')
    for a,b,value in reversed(edits):text=text[:a]+value+text[b:]
    return text
