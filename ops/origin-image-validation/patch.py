"""Disable inherited proxy cache only in the existing upload proxy location."""
import re
MARKER='# mooncci: preserve upload validators'
def patch(text):
    if MARKER in text: raise ValueError('Already patched')
    matches=list(re.finditer(r'(?m)^([ \t]*)location\s+\^~\s+/api/uploads/\s*\{[ \t]*$',text))
    if len(matches)!=1: raise ValueError('Expected one standalone upload location')
    match=matches[0]
    end=re.search(r'(?m)^[ \t]*\}',text[match.end():])
    if not end: raise ValueError('Missing location closing brace')
    body=text[match.end():match.end()+end.start()]
    uncommented=re.sub(r'(?m)#.*$','',body)
    if '{' in uncommented or '}' in uncommented: raise ValueError('Nested configuration needs review')
    if not re.search(r'proxy_pass\s+http://127\.0\.0\.1:3001(?:/api/uploads/)?\s*;',uncommented): raise ValueError('Unexpected upload upstream')
    if re.search(r'\b(proxy_cache|include)\s',uncommented): raise ValueError('Explicit cache/include needs review')
    return text[:match.end()]+'\n'+match[1]+'    '+MARKER+'\n'+match[1]+'    proxy_cache off;'+text[match.end():]
