import { X509Certificate } from 'node:crypto';
export function createGoogleCache({fetcher=fetch, now=Date.now}={}) {
  let saved=null, pending=null;
  async function refresh() {
    const response=await fetcher('https://www.googleapis.com/oauth2/v1/certs',{
      headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)
    });
    if(!response.ok) {await response.body?.cancel();throw Error('upstream');}
    const chunks=[];let size=0;
    for await(const chunk of response.body) {
      size+=chunk.length;
      if(size>262144) throw Error('size');
      chunks.push(chunk);
    }
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!data || Array.isArray(data) || typeof data!=='object') throw Error('certificates');
    const dates=Object.values(data).map(value=>new X509Certificate(value));
    const usable=dates.filter(cert=>Date.parse(cert.validFrom)<=now() && Date.parse(cert.validTo)>now());
    if(!usable.length) throw Error('certificates');
    const maxAge=/max-age=(\d+)/i.exec(response.headers.get('cache-control')||'');
    const age=Number(response.headers.get('age')||0);
    const control=response.headers.get('cache-control')||'';
    const seconds=/no-store|no-cache/i.test(control) ? 0 :
      Math.min(Math.max(0,(maxAge?Number(maxAge[1]):0)-(Number.isFinite(age)?Math.max(0,age):0)),300);
    const remaining=Math.min(...usable.map(cert=>Date.parse(cert.validTo)-now()));
    saved={body:JSON.stringify(data),expires:now()+Math.min(seconds*1000,remaining)};
    return saved;
  }
  return async function get() {
    if(!saved || saved.expires<=now()) {
      if(!pending) pending=refresh().finally(()=>{pending=null;});
      await pending;
    }
    return new Response(saved.body,{headers:{
      'Content-Type':'application/json',
      'Cache-Control':'public, max-age='+Math.max(0,Math.floor((saved.expires-now())/1000)),
      'X-Content-Type-Options':'nosniff'
    }});
  };
}
