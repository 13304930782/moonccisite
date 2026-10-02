import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import github from './github-worker.mjs';
import {createGoogleCache} from './google-cache.mjs';
export function createServer({env=process.env, google=createGoogleCache()}={}) {
  if(!/^[a-f0-9]{64}$/.test(env.GITHUB_OAUTH_PROXY_KEY||'')) throw Error('Missing valid proxy key');
  let active=0;
  const server=http.createServer(async(req,res)=>{
    if(active>=32){res.writeHead(503);res.end();return;}
    active++;
    try {
      if(!req.url || req.url.length>1024){res.writeHead(414);res.end();return;}
      let response;
      if(req.url==='/google-certs' && req.method==='GET') response=await google();
      else {
        // Reject unauthenticated requests before accepting any credential body.
        const supplied=String(req.headers['x-mooncci-proxy-key']||'');
        if(!/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(env.GITHUB_OAUTH_PROXY_KEY))) {
          res.writeHead(403,{'Cache-Control':'no-store'});res.end();return;
        }
        const chunks=[];let bytes=0;
        for await(const chunk of req) {
          bytes+=chunk.length;
          if(bytes>16384){res.writeHead(413);res.end();return;}
          chunks.push(chunk);
        }
        const headers=new Headers();
        for(const [name,value] of Object.entries(req.headers)) {
          if(value!==undefined) headers.set(name,Array.isArray(value)?value.join(','):value);
        }
        const request=new Request('http://127.0.0.1'+req.url,{
          method:req.method,headers,
          body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)
        });
        response=await github.fetch(request,env);
      }
      const output=Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(output);
    } catch {
      res.writeHead(502,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end('{"error":"relay_unavailable"}');
    } finally { active--; }
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  server.setTimeout(15000,socket=>socket.destroy());
  return server;
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1]||'')).href) {
  createServer().listen(3103,'127.0.0.1',()=>console.log('Login relay listening on 127.0.0.1:3103'));
}
