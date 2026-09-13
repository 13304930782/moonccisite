const crypto = require('crypto');
const db = require('../db');
const { authRequired, adminOnly, getUserFromRequest, isAdminLike } = require('../middleware/auth');
const router = require('../lib/asyncRouter')();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const day = time => new Date(time).toISOString().slice(0,10);
const staticPaths = new Set(['/','/articles','/updates','/projects','/tags','/categories','/search','/early-access','/electricity','/rss']);
let cleanedAt = 0;
router.use('/analytics', require('express-rate-limit')({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false}));
router.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
async function publicPage(input) {
 if (typeof input !== 'string' || input.length > 512 || input.includes('?') || input.includes('#')) return null;
 if (staticPaths.has(input)) return {path:input};
 let match = input.match(/^\/article\/([0-9]+)$/);
 if (match) {
  const [[post]] = await db.query("SELECT id FROM posts WHERE id=? AND status='published'",[match[1]]);
  return post ? {path:`/article/${post.id}`,postId:post.id}:null;
 }
 match=input.match(/^\/(projects|updates)\/([^/]+)$/);
 if (match) {
  let id;try{id=decodeURIComponent(match[2]);}catch{return null;}
  const table=match[1],field=table==='projects'?'slug':'id';
  const [[item]]=await db.query(`SELECT ${field} AS id FROM ${table} WHERE ${field}=? AND status='published'`,[id]);
  return item?{path:`/${table}/${encodeURIComponent(item.id)}`}:null;
 }
 // Search terms and arbitrary category/tag values are deliberately not collected.
 return null;
}
async function total(postId) {
 if (!postId) return null;
 const [[row]]=await db.query('SELECT views FROM analytics_article_totals WHERE post_id=?',[postId]);
 return Number(row?.views||0);
}
router.get('/analytics/article/:id',async(req,res)=>{
 const page=await publicPage(`/article/${req.params.id}`);
 if(!page)return res.status(404).json({message:'文章不存在'});
 res.json({views:await total(page.postId)});
});
router.post('/analytics/view',async(req,res)=>{
 const page=await publicPage(req.body?.path);
 if(!page)return res.status(400).json({message:'不统计此页面'});
 let user=null;try{user=await getUserFromRequest(req);}catch(error){if(!['JsonWebTokenError','TokenExpiredError','NotBeforeError'].includes(error.name))throw error;}
 if(isAdminLike(user) || req.get('DNT')==='1' || /bot|crawler|spider|headless/i.test(req.get('User-Agent')||''))return res.json({counted:false,views:await total(page.postId)});
 const secret=process.env.JWT_SECRET;if(!secret)throw new Error('Analytics secret unavailable');
 let cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('mooncci_visit='))?.slice('mooncci_visit='.length);
 if(!/^[a-f0-9]{32}$/.test(cookie||''))cookie=crypto.randomBytes(16).toString('hex');
 res.cookie('mooncci_visit',cookie,{httpOnly:true,secure:req.secure,sameSite:'lax',maxAge:90*86400000,path:'/'});
 const visitor=crypto.createHmac('sha256',secret).update('analytics:'+cookie).digest('hex');
 const now=Date.now(),date=day(now),pageHash=hash(page.path);
 let source='direct';try{const host=new URL(req.body.referrer).hostname;if(host&&host.length<=253)source=host;}catch{}
 const device=['mobile','tablet','desktop'].includes(req.body.device)?req.body.device:'desktop';
 const c=await db.getConnection();let counted=false;
 try{
  await c.beginTransaction();
  await c.query('INSERT INTO analytics_visits(day,visitor,page_hash,path,device,source,member) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE views=views',[date,visitor,pageHash,page.path,device,source,Number(Boolean(user&&user.status==='active'))]);
  const [result]=await c.query('UPDATE analytics_visits SET views=views+1,last_seen=?,member=GREATEST(member,?) WHERE day=? AND visitor=? AND page_hash=? AND last_seen<=?',[now,Number(Boolean(user&&user.status==='active')),date,visitor,pageHash,now-30000]);
  counted=result.affectedRows===1;
  if(counted){
   await c.query('INSERT INTO analytics_daily(day,page_hash,path,views) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE views=views+1',[date,pageHash,page.path]);
   if(page.postId)await c.query('INSERT INTO analytics_article_totals(post_id,views) VALUES (?,1) ON DUPLICATE KEY UPDATE views=views+1',[page.postId]);
  }
  await c.commit();
 }catch(error){await c.rollback();throw error;}finally{c.release();}
 // Bounded retention cleanup; lifetime aggregate totals are retained.
 if(now-cleanedAt>3600000){cleanedAt=now;db.query('DELETE FROM analytics_visits WHERE day<? LIMIT 5000',[day(now-90*86400000)]).catch(()=>{cleanedAt=0;});}
 res.json({counted,views:await total(page.postId)});
});
router.get('/admin/analytics',authRequired,adminOnly,async(req,res)=>{
 const days=Number(req.query.days||30);if(![7,30,90].includes(days))return res.status(400).json({message:'请选择7、30或90天'});
 const now=Date.now(),start=day(now-(days-1)*86400000),end=day(now);
 const since=Date.parse(start+'T00:00:00Z')/1000;
 const [[summaryRows],[trend],[popular],[devices],[sources],[userRows],[newUsers],[roles],[identities],[meta]]=await Promise.all([
  db.query('SELECT COALESCE((SELECT SUM(views) FROM analytics_daily),0) AS totalViews, COALESCE((SELECT SUM(views) FROM analytics_daily WHERE day BETWEEN ? AND ?),0) AS views, (SELECT COUNT(DISTINCT visitor) FROM analytics_visits WHERE day BETWEEN ? AND ? AND views>0) AS visitors, (SELECT COUNT(DISTINCT visitor) FROM analytics_visits WHERE last_seen>=? AND member=1) AS activeMembers',[start,end,start,end,since*1000]),
  db.query('SELECT DATE_FORMAT(d.day,"%Y-%m-%d") AS day,SUM(d.views) AS views,(SELECT COUNT(DISTINCT v.visitor) FROM analytics_visits v WHERE v.day=d.day AND v.views>0) AS visitors FROM analytics_daily d WHERE d.day BETWEEN ? AND ? GROUP BY d.day ORDER BY d.day',[start,end]),
  db.query('SELECT path,SUM(views) AS views FROM analytics_daily WHERE day BETWEEN ? AND ? GROUP BY path ORDER BY views DESC LIMIT 15',[start,end]),
  db.query('SELECT device AS label,SUM(views) AS views FROM analytics_visits WHERE day BETWEEN ? AND ? GROUP BY device ORDER BY views DESC',[start,end]),
  db.query('SELECT source AS label,SUM(views) AS views FROM analytics_visits WHERE day BETWEEN ? AND ? GROUP BY source ORDER BY views DESC LIMIT 10',[start,end]),
  db.query("SELECT COUNT(*) AS total,SUM(ap.deleted_at IS NOT NULL) AS deleted,SUM(ap.deleted_at IS NULL AND u.status='disabled') AS disabled,SUM(ap.deleted_at IS NULL AND u.status='active') AS active FROM users u LEFT JOIN account_profiles ap ON ap.user_id=u.id"),
  db.query('SELECT DATE_FORMAT(TIMESTAMPADD(SECOND,UNIX_TIMESTAMP(created_at),"1970-01-01"),"%Y-%m-%d") AS day,COUNT(*) AS count FROM users WHERE UNIX_TIMESTAMP(created_at)>=? GROUP BY day ORDER BY day',[since]),
  db.query('SELECT role AS label,COUNT(*) AS count FROM users u WHERE NOT EXISTS(SELECT 1 FROM account_profiles ap WHERE ap.user_id=u.id AND ap.deleted_at IS NOT NULL) GROUP BY role'),
  db.query("SELECT provider AS label,COUNT(DISTINCT user_id) AS count FROM oauth_identities GROUP BY provider UNION ALL SELECT 'google',COUNT(*) FROM users WHERE google_sub IS NOT NULL AND google_sub<>''"),
  db.query('SELECT started_at FROM analytics_meta WHERE id=1')
 ]);
 const trendMap=new Map(trend.map(x=>[x.day,x])),registrationMap=new Map(newUsers.map(x=>[x.day,Number(x.count)]));
 res.json({days,start,end,timezone:'UTC',startedAt:meta[0]?.started_at,summary:summaryRows[0],users:userRows[0],popular,devices,sources,roles,identities,trend:Array.from({length:days},(_,i)=>{const date=day(Date.parse(start+'T00:00:00Z')+i*86400000);return{day:date,views:Number(trendMap.get(date)?.views||0),visitors:Number(trendMap.get(date)?.visitors||0),registrations:registrationMap.get(date)||0};})});
});
module.exports=router;
