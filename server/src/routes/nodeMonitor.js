const crypto = require('node:crypto');
const ORIGIN = 'https://komari.mooncci.site:8443';
const CONFIG_KEY = 'node_monitor_private_v1';
const allowed = (user, config) => user?.role === 'owner' || (config.allowedUserIds || []).includes(Number(user?.id));
const cleanText = value => typeof value === 'string' ? value.slice(0,160) : '';
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
function list(data) { if(Array.isArray(data))return data;if(Array.isArray(data?.records))return data.records;if(Array.isArray(data?.data))return data.data;throw Error('Invalid node data'); }
async function upstream(path, key, fetcher=fetch, signal) {
 const response=await fetcher(ORIGIN+path,{headers:{Authorization:'Bearer '+key,Accept:'application/json'},redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('Monitor upstream unavailable');
 let bytes=0,chunks=[];for await(const chunk of response.body){bytes+=chunk.length;if(bytes>2*1024*1024)throw Error('Monitor response too large');chunks.push(Buffer.from(chunk));}
 const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(value.status==='error')throw Error('Monitor rejected access');return value.data??value;
}
function createRouter({db=require('../db'),auth=require('../middleware/auth'),secrets=require('../lib/mailboxSecurity'),fetcher=fetch}={}) {
 const router=require('../lib/asyncRouter')();let cached,flight;
 async function config(){const [[row]]=await db.query('SELECT setting_value FROM site_settings WHERE setting_key=? LIMIT 1',[CONFIG_KEY]);return row?JSON.parse(row.setting_value):{allowedUserIds:[]};}
 const request=(path,key,signal)=>upstream(path,key,fetcher,signal);
 router.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.vary('Cookie');res.vary('Authorization');next();});
 router.use(auth.authRequired);
 router.get('/access',async(req,res)=>res.json({allowed:allowed(req.user,await config()),owner:req.user.role==='owner'}));
 router.get('/settings',auth.ownerOnly,async(req,res)=>{const c=await config();let users=[];if(c.allowedUserIds?.length)[users]=await db.query('SELECT id,username,role,status FROM users WHERE id IN (?)',[c.allowedUserIds]);res.json({origin:ORIGIN,configured:!!c.secret,allowedUsers:users});});
 router.get('/users',auth.ownerOnly,async(req,res)=>{const q=String(req.query.q||'').trim().slice(0,80);if(!q)return res.json([]);const [rows]=await db.query("SELECT id,username,role FROM users WHERE status<>'disabled' AND username LIKE ? ORDER BY id LIMIT 20",['%'+q+'%']);res.json(rows);});
 router.put('/settings',auth.ownerOnly,async(req,res)=>{
  const ids=req.body.allowedUserIds;if(!Array.isArray(ids)||ids.length>100||ids.some(id=>!Number.isSafeInteger(id)||id<=0))return res.status(400).json({message:'授权用户无效。'});
  const key=req.body.apiKey;if(key!==undefined&&(typeof key!=='string'||key.length>512||/[\s\x00-\x1f]/.test(key)))return res.status(400).json({message:'API 密钥格式无效。'});
  const old=await config();let secret=old.secret;
  if(key){try{list(await request('/api/nodes',key));}catch{return res.status(400).json({message:'无法连接 Komari，请检查 API 密钥后重试。'});}secret=secrets.seal(key,'komari-monitor:v1');}
  if(!secret)return res.status(400).json({message:'请先配置 API 密钥。'});
  if(ids.length){const [valid]=await db.query("SELECT id FROM users WHERE id IN (?) AND status<>'disabled'",[ids]);if(new Set(valid.map(x=>Number(x.id))).size!==new Set(ids).size)return res.status(400).json({message:'授权名单中包含不存在或已停用的用户。'});}
  await db.query('INSERT INTO site_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',[CONFIG_KEY,JSON.stringify({secret,allowedUserIds:[...new Set(ids)]})]);cached=null;res.json({ok:true});
 });
 router.get('/snapshot',async(req,res)=>{
  const c=await config();if(!allowed(req.user,c))return res.status(403).json({message:'当前账号没有节点监控权限，请联系站长。'});
  if(!c.secret)return res.status(409).json({message:'节点监控尚未配置，请联系站长。'});
  const identity=crypto.createHash('sha256').update(c.secret).digest('hex');
  try {
   if(cached?.identity===identity&&Date.now()-cached.created<10000)return res.json(cached.data);
   if(!flight||flight.identity!==identity){
    const promise=(async()=>{const deadline=AbortSignal.timeout(15000);const key=secrets.open(c.secret,'komari-monitor:v1'),nodes=list(await request('/api/nodes',key,deadline));if(nodes.length>100)throw Error('Too many nodes');const output=[];
     // Bound upstream concurrency and return only the fields displayed by this page.
     for(let i=0;i<nodes.length;i+=4)output.push(...await Promise.all(nodes.slice(i,i+4).map(async node=>{
      if(!/^[a-f0-9-]{36}$/i.test(node.uuid))throw Error('Invalid node');
      let record=null;try{const records=list(await request('/api/recent/'+node.uuid,key,deadline));record=records.reduce((latest,r)=>!latest||Date.parse(r.time)>Date.parse(latest.time)?r:latest,null);}catch{}
      const last=record?.time&&Number.isFinite(Date.parse(record.time))?record.time:null;
      const live=last&&Date.now()-Date.parse(last)<90000&&Date.parse(last)<=Date.now()+30000;
      return {id:node.uuid,name:cleanText(node.name),region:cleanText(node.region),group:cleanText(node.group),state:!record?'unknown':live?'online':'offline',updatedAt:last,cpu:live?number(record.cpu):null,ram:live?number(record.ram):null,ramTotal:number(record?.ram_total??node.mem_total),disk:live?number(record.disk):null,diskTotal:number(record?.disk_total??node.disk_total),netIn:live?number(record.net_in):null,netOut:live?number(record.net_out):null};
     })));
     const data={checkedAt:new Date().toISOString(),nodes:output};cached={identity,created:Date.now(),data};return data;
    })();flight={identity,promise};promise.finally(()=>{if(flight?.promise===promise)flight=null;}).catch(()=>{});
   }
   res.json(await flight.promise);
  }catch{res.status(502).json({message:'暂时无法读取节点状态，请稍后重试。'});}
 });return router;
}
module.exports={createRouter,allowed,upstream,ORIGIN};
