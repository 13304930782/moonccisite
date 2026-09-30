"""Insert a location-level override while preserving existing conditional blocks."""
import re
MARKER='# mooncci: preserve upload validators'

def structural(text):
    """Mask comments, quoted/escaped characters and variable braces, retaining offsets."""
    chars=list(text); quote=None; i=0
    while i<len(text):
        c=text[i]
        if c=='\\':
            chars[i]=' '
            if i+1<len(text): chars[i+1]=' ';i+=2
            else:i+=1
            continue
        if quote:
            if c==quote:quote=None
            if c!='\n':chars[i]=' '
        elif c in ('"', "'"):
            quote=c;chars[i]=' '
        elif c=='#':
            while i<len(text) and text[i]!='\n':chars[i]=' ';i+=1
            continue
        elif c=='$' and text[i:i+2]=='${':
            end=text.find('}',i+2)
            if end<0:raise ValueError('Unclosed variable')
            chars[i+1]=chars[end]=' ';i=end
        i+=1
    if quote:raise ValueError('Unclosed quote')
    return ''.join(chars)

def patch(text):
    if MARKER in text:raise ValueError('Already patched')
    masked=structural(text)
    matches=list(re.finditer(r'(?m)^([ \t]*)location\s+\^~\s+/api/uploads/\s*\{[ \t]*$',masked))
    if len(matches)!=1:raise ValueError('Expected one standalone upload location')
    match=matches[0];opening=masked.index('{',match.start());depth=1;end=opening+1
    while end<len(masked) and depth:
        if masked[end]=='{':depth+=1
        elif masked[end]=='}':depth-=1
        if depth:end+=1
    if depth:raise ValueError('Unclosed upload location')
    body=masked[opening+1:end]
    # Existing if/return blocks are preserved, but sublocations/includes need separate review.
    for start in [m.start() for m in re.finditer(r'\{',body)]:
        prefix=re.split(r'[;{}]',body[:start])[-1].strip()
        if not re.match(r'^if\s*\(',prefix):raise ValueError('Unsupported nested block')
    if re.search(r'\b(proxy_cache|include)\s',body):raise ValueError('Explicit cache/include needs review')
    upstream=list(re.finditer(r'\bproxy_pass\s+http://127\.0\.0\.1:3001(?:/api/uploads/)?\s*;',body))
    if len(upstream)!=1 or len(re.findall(r'\bproxy_pass\b',body))!=1:raise ValueError('Unexpected upload upstream')
    prefix=body[:upstream[0].start()]
    if prefix.count('{')!=prefix.count('}'):raise ValueError('Upstream must be at location scope')
    insertion='\n'+match[1]+'    '+MARKER+'\n'+match[1]+'    proxy_cache off;'
    return text[:opening+1]+insertion+text[opening+1:]
