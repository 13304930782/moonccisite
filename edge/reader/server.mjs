import http from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { publicRead, fixedOrigin } from '../shared/public-policy.mjs';

const types = { js:'text/javascript', css:'text/css', woff:'font/woff', woff2:'font/woff2', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', svg:'image/svg+xml', webp:'image/webp', gif:'image/gif', avif:'image/avif' };
function equal(a,b) { const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length && timingSafeEqual(x,y); }
export function createReader({ origin, key, dist, fetcher = fetch }) {
  origin = fixedOrigin(origin);
  if (['mooncci.site','www.mooncci.site'].includes(new URL(origin).hostname)) throw new Error('Use a direct primary origin, never the routed public domain');
  if (!key || key.length < 32 || /REPLACE|EXAMPLE/i.test(key)) throw new Error('Reader key must contain at least 32 characters');
  dist = path.resolve(dist);
  let active=0;
  return http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    let counted=false;
    const stop=(status,text)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});res.end(text);};
    try {
      if (!equal(req.headers['x-mooncci-reader-key'],key)) return stop(403,'Forbidden');
      if(active>=8)return stop(503,'Reader busy');
      active++;counted=true;
      if (req.method==='GET' && req.url==='/_reader/health') return stop(200,'ok');
      if (!req.url.startsWith('/') || req.url.startsWith('//') || /%|\\/.test(req.url.split('?')[0])) return stop(404,'Not found');
      const url=new URL(req.url,'https://mooncci.site');
      const request=new Request(url,{method:req.method,headers:req.headers});
      if(!publicRead(request)) return stop(403,'Not a public read');
      if(url.pathname.startsWith('/assets/')) {
        const file=path.join(dist,url.pathname.slice(1));
        let info;try{info=await stat(file);}catch{return stop(404,'Not found');}
        if(!info.isFile() || info.size>16*1024*1024)return stop(404,'Not found');
        const resolved=await realpath(file);
        if(!resolved.startsWith((await realpath(dist))+path.sep))return stop(404,'Not found');
        const body=await readFile(file);
        res.writeHead(200,{'Content-Type':types[path.extname(file).slice(1)]||'application/octet-stream','Cache-Control':'public, max-age=31536000, immutable','Content-Length':body.length});
        return res.end(req.method==='HEAD'?undefined:body);
      }
      // Current origin responses are no-store. Never override that with a shared cache.
      const upstream=new URL(url.pathname+url.search,origin);
      const headers=new Headers();
      for(const name of ['accept','accept-language','if-none-match','if-modified-since']) if(req.headers[name])headers.set(name,req.headers[name]);
      const response=await fetcher(upstream,{method:req.method,headers,redirect:'manual',signal:AbortSignal.timeout(10000)});
      if(response.headers.has('set-cookie')){await response.body?.cancel();return stop(502,'Unexpected private response');}
      if(response.status>=300 && response.status<400 && response.status!==304){await response.body?.cancel();return stop(502,'Unexpected redirect');}
      const chunks=[];let size=0;
      if(response.body) {
        const reader=response.body.getReader();
        for (;;) {
          const {done,value}=await reader.read();if(done)break;
          size+=value.length;if(size>8*1024*1024){await reader.cancel();return stop(502,'Response too large');}
          chunks.push(Buffer.from(value));
        }
      }
      const body=Buffer.concat(chunks);
      const outgoing={'Cache-Control':'no-store'};
      for(const name of ['content-type','etag','last-modified','x-robots-tag']) if(response.headers.has(name))outgoing[name]=response.headers.get(name);
      res.writeHead(response.status,outgoing);res.end(req.method==='HEAD'?undefined:body);
    } catch { if(!res.headersSent)stop(502,'Reader upstream unavailable');else res.destroy(); }
    finally { if(counted)active--; }
  });
}
if (process.argv[1] && import.meta.url===pathToFileURL(await realpath(process.argv[1])).href) {
  const server=createReader({origin:process.env.PRIMARY_ORIGIN,key:process.env.READER_KEY,dist:process.env.READER_DIST});
  server.listen(Number(process.env.READER_PORT||3102),'127.0.0.1',()=>console.log('[reader] listening on loopback:'+server.address().port));
}
