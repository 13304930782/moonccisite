const https = require('node:https');
const dns = require('node:dns/promises');
const net = require('node:net');
const error = message => Object.assign(new Error(message), {status:400});
function allowedOrigins() {
 return new Set(String(process.env.ARTICLE_IMPORT_ORIGINS || 'https://moooncci.cn').split(',').map(x=>x.trim()).filter(Boolean));
}
function validateUrl(value, origins=allowedOrigins()) {
 let u;try{u=new URL(value);}catch{throw error('请输入完整的旧站文章 HTTPS 链接。');}
 if(u.protocol!=='https:'||u.username||u.password||!origins.has(u.origin)||net.isIP(u.hostname))throw error('仅支持已配置的旧站域名，不支持该地址。');
 u.hash='';return u;
}
function publicV4(ip) {
 if(net.isIP(ip)!==4)return false;
 const [a,b]=ip.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19)));
}
// Resolve once and pin that address to the TLS connection, including redirects.
async function fetchBytes(value,{limit=4*1024*1024,signal,origins=allowedOrigins(),redirects=0}={}) {
 const u=validateUrl(value,origins);signal?.throwIfAborted();
 let timer;let records;try{records=await Promise.race([dns.lookup(u.hostname,{family:4,all:true}),new Promise((_r,reject)=>{timer=setTimeout(()=>reject(error('旧站 DNS 解析超时。')),5000);})]);}finally{clearTimeout(timer);}signal?.throwIfAborted();
 if(!records.length||records.some(r=>!publicV4(r.address)))throw error('旧站地址解析到非公开网络，已停止请求。');
 const result=await new Promise((resolve,reject)=>{
  const req=https.get(u,{signal,headers:{'User-Agent':'mooncci-article-import/1.0','Accept-Encoding':'identity'},lookup:(_host,options,cb)=>options?.all?cb(null,[records[0]]):cb(null,records[0].address,4)},res=>{
   if([301,302,303,307,308].includes(res.statusCode)){res.resume();resolve({redirect:res.headers.location});return;}
   if(res.statusCode!==200){res.resume();reject(error(`旧站请求失败（HTTP ${res.statusCode}）。`));return;}
   if(Number(res.headers['content-length']||0)>limit){res.destroy();reject(error('远程文件超出大小限制。'));return;}
   let size=0;const chunks=[];res.on('data',b=>{size+=b.length;if(size>limit){res.destroy(error('远程文件超出大小限制。'));return;}chunks.push(b);});res.on('error',reject);res.on('end',()=>resolve({body:Buffer.concat(chunks)}));
  });req.setTimeout(15000,()=>req.destroy(error('旧站响应超时，请重试。')));req.on('error',reject);
 });
 if(result.redirect){if(redirects>=3)throw error('旧站重定向次数过多。');return fetchBytes(new URL(result.redirect,u).href,{limit,signal,origins,redirects:redirects+1});}
 if(!result.body)throw error('旧站重定向无效。');return result.body;
}
module.exports={validateUrl,publicV4,fetchBytes,error};
