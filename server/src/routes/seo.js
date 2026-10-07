const documents=require('../lib/publicDocument');
const fs=require('node:fs/promises');const path=require('node:path');const seo=require('../lib/seo');
function createSeoRouter({db,renderDocument=documents.renderDocument,injectDocument=documents.injectDocument,loadResource=documents.loadPublicResource,readTemplate=()=>fs.readFile(process.env.SEO_HTML_TEMPLATE||'/www/wwwroot/mooncci.site/index.html','utf8')}={}){
 const router=require('../lib/asyncRouter')();
 // Includes document and sitemap routes outside the global /api limiter.
 const limiter=require('express-rate-limit')({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false,message:{message:'Too many requests. Please try again later.'}});
 async function baseMetadata(pathname){
  const [[row]]=await db.query("SELECT setting_value FROM site_settings WHERE setting_key='brand' LIMIT 1");let brand={};try{brand=JSON.parse(row?.setting_value||'{}');}catch{}
  if(/^\/article\/\d+$/.test(pathname)){const [[post]]=await db.query("SELECT p.*,u.username AS author_name FROM posts p JOIN users u ON u.id=p.author_id WHERE p.id=? AND p.status='published'",[pathname.split('/').pop()]);if(post)return {status:200,meta:seo.articleMeta(post,brand)};return {status:404,meta:{...seo.baseMeta(pathname,brand),title:'文章不存在',description:'这篇文章不存在或未公开。',robots:'noindex, nofollow'}};}
  if(/^\/updates\/[1-9]\d*$/.test(pathname)){const [[update]]=await db.query("SELECT id,content,image_url FROM updates WHERE id=? AND status='published'",[pathname.split('/').pop()]);if(update)return {status:200,meta:seo.updateMeta(update,brand)};return {status:404,meta:{...seo.baseMeta(pathname,brand),title:'近况不存在',robots:'noindex, nofollow'}};}
  if(/^\/projects\/[a-zA-Z0-9_-]+$/.test(pathname)){const [[project]]=await db.query("SELECT slug,name,summary,content,cover_image FROM projects WHERE slug=? AND status='published'",[pathname.split('/').pop()]);if(project)return {status:200,meta:seo.projectMeta(project,brand)};return {status:404,meta:{...seo.baseMeta(pathname,brand),title:'作品不存在',robots:'noindex, nofollow'}};}
  if(pathname.startsWith('/category/')){let category;try{category=decodeURIComponent(pathname.slice('/category/'.length));}catch{}if(category&&category.length<=100&&!/[\/#?]/.test(category)){const [[row]]=await db.query("SELECT category FROM posts WHERE status='published' AND category=? LIMIT 1",[category]);if(row)return {status:200,meta:seo.categoryMeta(row.category,brand)};}return {status:404,meta:{...seo.baseMeta(pathname,brand),title:'分类不存在',robots:'noindex, nofollow'}};}
  return {status:200,meta:seo.baseMeta(pathname,brand)};
 }
 async function metadata(pathname,query={}) {
  let result=await baseMetadata(pathname);
  const notFound=()=>({status:404,meta:{...seo.baseMeta(pathname),title:'页面不存在',robots:'noindex, nofollow'}});
  if(/^\/(article|updates)\//.test(pathname)&&!/^\/(article|updates)\/[1-9]\d*$/.test(pathname))return notFound();
  if(!documents.publicRoutes.test(pathname)&&!documents.privateRoutes.test(pathname)) return notFound();
  if((pathname==='/series'||pathname.startsWith('/series/'))&&process.env.PUBLISHING_ENABLED!=='true')return notFound();
  if(/^\/(tag|series)\//.test(pathname)) {
   let name;try{name=decodeURIComponent(pathname.split('/').pop());}catch{return notFound();}
   if(!name||name.length>100||/[\/#?]/.test(name))return notFound();
   if(pathname.startsWith('/tag/')) {
    const [rows]=await db.query("SELECT tags FROM posts WHERE status='published' AND tags IS NOT NULL");
    if(!rows.some(row=>{try{return (Array.isArray(row.tags)?row.tags:JSON.parse(row.tags||'[]')).includes(name);}catch{return false;}}))return notFound();
    result.meta={...result.meta,title:`${name} · 标签 · ${result.meta.siteName}`,description:`阅读「${name}」标签下的文章。`,robots:'index, follow'};
   } else {
    const [[series]]=await db.query("SELECT s.* FROM article_series s JOIN article_series_posts sp ON sp.series_id=s.id JOIN posts p ON p.id=sp.post_id AND p.status='published' WHERE s.slug=? LIMIT 1",[name]);
    if(!series)return notFound();
    result.meta={...result.meta,title:`${series.title} · 专栏 · ${result.meta.siteName}`,description:seo.plain(series.description)||`连续阅读「${series.title}」专栏的文章。`,robots:'index, follow'};
   }
  }
  const paged=/^\/(articles|archives|updates|projects|category\/[^/]+|tag\/[^/]+)$/.test(pathname);
  if(paged&&query.page!==undefined&&!/^[1-9]\d{0,5}$/.test(String(query.page)))return notFound();
  const page=paged?Number(query.page||1):1;
  if(page>1&&result.status===200){
   let resource;
   if(pathname==='/articles')resource=`/posts?format=paged&pageSize=12&page=${page}`;
   else if(pathname.startsWith('/tag/')||pathname.startsWith('/category/'))resource=`/posts?${pathname.startsWith('/tag/')?'tag':'category'}=${encodeURIComponent(decodeURIComponent(pathname.split('/').pop()))}&format=paged&pageSize=12&page=${page}`;
   else if(pathname==='/archives')resource=`/posts/archives?page=${page}`;
   else if(pathname==='/updates')resource=`/activity?page=${page}&type=${encodeURIComponent(query.type||'')}`;
   else resource=`/projects?page=${page}`;
   const data=await loadResource(resource);if(page>Math.max(1,Math.ceil(data.total/data.pageSize)))return notFound();
  }
  if(page>1){result.meta.canonical+='?page='+page;result.meta.title=`${result.meta.title} · 第 ${page} 页`;}
  if(query.type && pathname==='/updates') {if(!['post','update','release'].includes(query.type))return notFound();result.meta.canonical+=(page>1?'&':'?')+'type='+query.type;}
  if(result.status===200&&result.meta.robots==='index, follow') {
   const graph=[];
   if(result.meta.jsonLd)graph.push(result.meta.jsonLd);
   if(pathname==='/')graph.push({'@type':'WebSite','@id':seo.origin()+'/#website',url:seo.origin()+'/',name:result.meta.siteName});
   else graph.push({'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'首页',item:seo.origin()+'/'},{'@type':'ListItem',position:2,name:result.meta.title.split(' · ')[0],item:result.meta.canonical}]});
   result.meta.jsonLd={'@context':'https://schema.org','@graph':graph};
  }
  return result;
 }
 router.get('/api/seo',limiter,async(req,res)=>{const pathname=String(req.query.path||'/');if(!/^\/[a-zA-Z0-9/_%.-]*$/.test(pathname)||pathname.length>512)return res.status(400).json({message:'无效页面地址'});const result=await metadata(pathname,req.query);res.set('Cache-Control','no-store');res.status(result.status).json(result.meta);});
 router.get('/robots.txt',limiter,(_req,res)=>{res.type('text/plain').send(`User-agent: *\nDisallow: /api/\nAllow: /api/posts\nAllow: /api/projects\nAllow: /api/updates/\nAllow: /api/activity\nAllow: /api/now$\nAllow: /api/settings/site$\nAllow: /api/settings/blog-pages$\nAllow: /api/publishing/config$\nAllow: /api/subscriptions/status$\nAllow: /api/series\nAllow: /api/seo?\nSitemap: ${seo.origin()}/sitemap.xml\n`);});
 router.get('/sitemap.xml',limiter,async(_req,res)=>{
  const [posts]=await db.query("SELECT id,COALESCE(updated_at,published_at,created_at) AS updated_at FROM posts WHERE status='published' ORDER BY id");
  const [updates]=await db.query("SELECT id,updated_at FROM updates WHERE status='published' ORDER BY id");
  const [projects]=await db.query("SELECT slug,updated_at FROM projects WHERE status='published' ORDER BY id");
  const [categories]=await db.query("SELECT DISTINCT category FROM posts WHERE status='published' AND category<>'' ORDER BY category");
  const [tagRows]=await db.query("SELECT tags FROM posts WHERE status='published' AND tags IS NOT NULL");
  const tags=new Set();for(const row of tagRows){try{for(const tag of (Array.isArray(row.tags)?row.tags:JSON.parse(row.tags||'[]')))if(typeof tag==='string'&&tag)tags.add(tag);}catch{}}
  const [series]=await db.query("SELECT s.slug,MAX(p.updated_at) AS updated_at FROM article_series s JOIN article_series_posts sp ON sp.series_id=s.id JOIN posts p ON p.id=sp.post_id AND p.status='published' GROUP BY s.id,s.slug");
  const rows=[...[...tags].map(tag=>({path:`/tag/${encodeURIComponent(tag)}`})),...series.filter(()=>process.env.PUBLISHING_ENABLED==='true').map(s=>({path:`/series/${encodeURIComponent(s.slug)}`,updated_at:s.updated_at})),...Object.keys(seo.titles).filter(path=>path!=='/series'||process.env.PUBLISHING_ENABLED==='true').map(path=>({path})),...posts.map(p=>({path:`/article/${p.id}`,updated_at:p.updated_at})),...updates.map(p=>({path:`/updates/${p.id}`,updated_at:p.updated_at})),...projects.map(p=>({path:`/projects/${encodeURIComponent(p.slug)}`,updated_at:p.updated_at})),...categories.map(p=>({path:`/category/${encodeURIComponent(p.category)}`}))];
  res.set('Cache-Control','no-store').type('application/xml').send(seo.sitemap(rows));
 });
 router.get('*',(req,res,next)=>{
  if(req.path.startsWith('/api/')||req.path.startsWith('/assets/')||req.path.startsWith('/uploads/')||/\.[a-z0-9]+$/i.test(req.path))return next('route');
  return limiter(req,res,next);
 },async(req,res,next)=>{
  const pathname=req.path.replace(/\/$/,'')||'/';
  let html;
  try {
   html=await readTemplate();
   if(!html.includes('</head>')||!html.includes('id="root"'))throw Error('Invalid HTML template');
   let result=await metadata(pathname,req.query);
   res.set('Cache-Control','private, no-store');
   // Authenticated draft reads stay on the existing authenticated browser API path.
   if(result.status===404&&/^\/article\/[1-9]\d*$/.test(pathname)&&req.headers.cookie)return res.status(404).set('X-Robots-Tag','noindex, nofollow').type('html').send(seo.renderHtml(html,result.meta));
   if(documents.privateRoutes.test(pathname))return res.status(result.status).set('X-Robots-Tag','noindex, follow').type('html').send(seo.renderHtml(html,result.meta));
   const resources=new Map();
   const load=value=>{if(!resources.has(value))resources.set(value,loadResource(value,req.ip));return resources.get(value);};
   const query=new URLSearchParams();for(const key of ['page','type','release'])if(typeof req.query[key]==='string')query.set(key,req.query[key]);
   const renderUrl=pathname+(query.size?'?'+query:'');
   let rendered=await renderDocument(renderUrl,load,result.status);
   const invalid=Object.values(rendered.data.resources).some(data=>data&&Number.isFinite(data.total)&&data.page>Math.max(1,Math.ceil(data.total/data.pageSize)));
   if(invalid||Object.values(rendered.data.errors||{}).includes(404)) {
    result={status:404,meta:{...seo.baseMeta(pathname),title:'页面不存在',robots:'noindex, nofollow'}};
    rendered=await renderDocument(renderUrl,load,404);
   }
   rendered.data.status=result.status;
   if(result.status!==200)res.set('X-Robots-Tag','noindex, nofollow');
   html=await injectDocument(html,rendered);
   res.status(result.status).type('html').send(seo.renderHtml(html,result.meta));
  } catch(error) {
   console.error('[seo/document]',error.message);
   res.status(503).set('Cache-Control','no-store').set('X-Robots-Tag','noindex').type('html');
   try {
    if(!html)throw Error('Template unavailable');
    const failure=await renderDocument(pathname,async value=>value==='/settings/site'?{brand:{site_title:'mooncci'},hero:{},footer:{}}:{enabled:false},503);
    return res.send(seo.renderHtml(await injectDocument(html,failure),{...seo.baseMeta(pathname),title:'页面暂时无法加载 · mooncci',robots:'noindex, nofollow'}));
   } catch { return res.send('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>暂时无法加载 · mooncci</title><body><main><h1>页面暂时无法加载</h1><p>请稍后重新加载。</p><a href="/">返回首页</a></main></body></html>'); }

  }
 });return router;
}
module.exports={createSeoRouter};
