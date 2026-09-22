const fs=require('node:fs/promises');const path=require('node:path');const seo=require('../lib/seo');
function createSeoRouter({db,readTemplate=()=>fs.readFile(process.env.SEO_HTML_TEMPLATE||'/www/wwwroot/mooncci.site/index.html','utf8')}={}){
 const router=require('../lib/asyncRouter')();
 // Includes document and sitemap routes outside the global /api limiter.
 router.use(require('express-rate-limit')({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false,message:{message:'Too many requests. Please try again later.'}}));
 async function metadata(pathname){
  const [[row]]=await db.query("SELECT setting_value FROM site_settings WHERE setting_key='brand' LIMIT 1");let brand={};try{brand=JSON.parse(row?.setting_value||'{}');}catch{}
  if(/^\/article\/\d+$/.test(pathname)){const [[post]]=await db.query("SELECT p.*,u.username AS author_name FROM posts p JOIN users u ON u.id=p.author_id WHERE p.id=? AND p.status='published'",[pathname.split('/').pop()]);if(post)return {status:200,meta:seo.articleMeta(post,brand)};return {status:404,meta:{...seo.baseMeta(pathname,brand),title:'文章不存在',description:'这篇文章不存在或未公开。',robots:'noindex, nofollow'}};}
  return {status:200,meta:seo.baseMeta(pathname,brand)};
 }
 router.get('/api/seo',async(req,res)=>{const pathname=String(req.query.path||'/');if(!/^\/[a-zA-Z0-9/_%.-]*$/.test(pathname)||pathname.length>512)return res.status(400).json({message:'无效页面地址'});const result=await metadata(pathname);res.set('Cache-Control','no-store');res.status(result.status).json(result.meta);});
 router.get('/robots.txt',(_req,res)=>{res.type('text/plain').send(`User-agent: *\nDisallow: /api/\nDisallow: /admin\nDisallow: /account\nDisallow: /search\nDisallow: /login\nDisallow: /register\nDisallow: /reset-password\nDisallow: /forgot-password\nDisallow: /complete-registration\nDisallow: /subscription/\nSitemap: ${seo.origin()}/sitemap.xml\n`);});
 router.get('/sitemap.xml',async(_req,res)=>{
  const [posts]=await db.query("SELECT id,COALESCE(updated_at,published_at,created_at) AS updated_at FROM posts WHERE status='published' ORDER BY id");
  const [updates]=await db.query("SELECT id,updated_at FROM updates WHERE status='published' ORDER BY id");
  const [projects]=await db.query("SELECT slug,updated_at FROM projects WHERE status='published' ORDER BY id");
  const rows=[...Object.keys(seo.titles).map(path=>({path})),...posts.map(p=>({path:`/article/${p.id}`,updated_at:p.updated_at})),...updates.map(p=>({path:`/updates/${p.id}`,updated_at:p.updated_at})),...projects.map(p=>({path:`/projects/${encodeURIComponent(p.slug)}`,updated_at:p.updated_at}))];
  res.set('Cache-Control','no-store').type('application/xml').send(seo.sitemap(rows));
 });
 router.get(['/article/:id','/','/articles','/archives','/about','/links','/projects','/updates','/tags','/categories','/rss'],async(req,res)=>{
  let result;if(req.params.id&&!/^\d+$/.test(req.params.id))result={status:404,meta:{...seo.baseMeta('/article/invalid'),title:'文章不存在',robots:'noindex, nofollow'}};else result=await metadata(req.path.replace(/\/$/,'')||'/');
  let html;try{html=await readTemplate();if(!html.includes('</head>')||!html.includes('id="root"'))throw Error('Invalid HTML template');}catch(e){console.error('[seo/template]',e.message);return res.status(503).set('X-Robots-Tag','noindex').type('text/plain').send('页面暂时不可用，请稍后重试。');}
  res.set('Cache-Control','no-store');if(result.status!==200)res.set('X-Robots-Tag','noindex, nofollow');res.status(result.status).type('html').send(seo.renderHtml(html,result.meta));
 });return router;
}
module.exports={createSeoRouter};
