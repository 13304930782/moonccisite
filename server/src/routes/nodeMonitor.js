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
 // Lock the shared settings row so key changes and per-user grants cannot overwrite each other.
 async function updateConfig(change){
  const connection=await db.getConnection();
  try{await connection.beginTransaction();await connection.query("INSERT INTO site_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_key=VALUES(setting_key)",[CONFIG_KEY,JSON.stringify({allowedUserIds:[]})]);
   const [[row]]=await connection.query('SELECT setting_value FROM site_settings WHERE setting_key=? FOR UPDATE',[CONFIG_KEY]);const value=change(JSON.parse(row.setting_value));
   await connection.query('UPDATE site_settings SET setting_value=? WHERE setting_key=?',[JSON.stringify(value),CONFIG_KEY]);await connection.commit();cached=null;
  }catch(e){await connection.rollback();throw e;}finally{connection.release();}
 }
 router.get('/settings',auth.ownerOnly,async(req,res)=>{const c=await config();res.json({origin:ORIGIN,configured:!!c.secret});});
 router.get('/users/:id',auth.ownerOnly,async(req,res)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<=0)return res.sendStatus(400);
  const [[user]]=await db.query('SELECT id,role,status FROM users WHERE id=? AND deleted_at IS NULL LIMIT 1',[id]);if(!user)return res.sendStatus(404);
  res.json({allowed:allowed(user,await config()),owner:user.role==='owner'});
 });
 router.put('/users/:id',auth.ownerOnly,async(req,res)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<=0||typeof req.body.allowed!=='boolean')return res.status(400).json({message:'权限设置无效。'});
  const [[user]]=await db.query('SELECT id,role,status FROM users WHERE id=? AND deleted_at IS NULL LIMIT 1',[id]);if(!user)return res.sendStatus(404);
  if(user.role==='owner')return res.status(400).json({message:'站长始终拥有节点监控权限。'});
  if(user.status==='disabled'&&req.body.allowed)return res.status(400).json({message:'请先恢复账号，再授予节点监控权限。'});
  await updateConfig(c=>({...c,allowedUserIds:req.body.allowed?[...new Set([...(c.allowedUserIds||[]),id])]:(c.allowedUserIds||[]).filter(x=>x!==id)}));
  res.json({allowed:req.body.allowed,message:'节点监控权限已保存。'});
 });
 router.put('/settings',auth.ownerOnly,async(req,res)=>{
  const key=req.body.apiKey;if(typeof key!=='string'||!key||key.length>512||/[\s\x00-\x1f]/.test(key))return res.status(400).json({message:'请填写有效的 API 密钥。'});
  try{list(await request('/api/nodes',key));}catch{return res.status(400).json({message:'无法连接 Komari，请检查 API 密钥后重试。'});}
  const secret=secrets.seal(key,'komari-monitor:v1');await updateConfig(c=>({...c,secret}));res.json({ok:true});
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
      let record=null;try{const records=list(await request('/api/recent/'+node.uuid,key,deadline));record=records.reduce((latest,r)=>!latest||Date.parse(r.time??r.updated_at)>Date.parse(latest.time??latest.updated_at)?r:latest,null);}catch{}
      const reported=record?.time??record?.updated_at;
      const last=reported&&Number.isFinite(Date.parse(reported))?reported:null;
      const live=last&&Date.now()-Date.parse(last)<90000&&Date.parse(last)<=Date.now()+30000;
      return {id:node.uuid,name:cleanText(node.name),region:cleanText(node.region),group:cleanText(node.group),state:!last?'unknown':live?'online':'offline',updatedAt:last,cpu:live?number(record.cpu?.usage??record.cpu):null,ram:live?number(record.ram?.used??record.ram):null,ramTotal:number(record?.ram?.total??record?.ram_total??node.mem_total),disk:live?number(record.disk?.used??record.disk):null,diskTotal:number(record?.disk?.total??record?.disk_total??node.disk_total),netIn:live?number(record.network?.down??record.net_in):null,netOut:live?number(record.network?.up??record.net_out):null};
     })));
     const data={checkedAt:new Date().toISOString(),nodes:output};cached={identity,created:Date.now(),data};return data;
    })();flight={identity,promise};promise.finally(()=>{if(flight?.promise===promise)flight=null;}).catch(()=>{});
   }
   res.json(await flight.promise);
  }catch{res.status(502).json({message:'暂时无法读取节点状态，请稍后重试。'});}
 });return router;
}
module.exports={createRouter,allowed,upstream,ORIGIN};
