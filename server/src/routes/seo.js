const documents=require('../lib/publicDocument');
const translations=require('../lib/articleTranslations');
const contentTranslations=require('../lib/contentTranslations');
const {articlePath,decodeArticleReference,resolveArticle}=require('../lib/articleSlug');
const fs=require('node:fs/promises');const path=require('node:path');const seo=require('../lib/seo');
function createSeoRouter({db,renderDocument=documents.renderDocument,injectDocument=documents.injectDocument,loadResource=documents.loadPublicResource,readTemplate=()=>fs.readFile(process.env.SEO_HTML_TEMPLATE||'/www/wwwroot/mooncci.site/index.html','utf8')}={}){
 const router=require('../lib/asyncRouter')();
 // Includes document and sitemap routes outside the global /api limiter.
 const limiter=require('express-rate-limit')({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false,message:{message:'Too many requests. Please try again later.'}});
 async function baseMetadata(pathname,locale='zh-CN'){
  const base=()=>seo.localizeMeta(seo.baseMeta(pathname,brand),pathname,locale);
  const [[row]]=await db.query("SELECT setting_value FROM site_settings WHERE setting_key='brand' LIMIT 1");let brand={};try{brand=JSON.parse(row?.setting_value||'{}');}catch{}
  if(locale==='en')brand=(await contentTranslations.localize(db,'site',{brand},locale,{id:'1'})).brand;
  if(pathname.startsWith('/article/')){const reference=decodeArticleReference(pathname.slice('/article/'.length));const post=reference?await resolveArticle(db,reference,{published:true}):null;if(post){let localized;try{localized=await translations.publicPost(db,post,locale,{strict:true});}catch(error){if(error.status!==404)throw error;return {status:404,meta:{...base(),title:'English translation unavailable',description:'This article has no published English translation.',robots:'noindex, nofollow',original:seo.origin()+articlePath(post)}};}const canonical=articlePath(post);return {status:200,meta:seo.articleMeta(localized,brand),redirect:pathname!==canonical?seo.localizedPath(canonical,locale):null};}return {status:404,meta:{...base(),title:locale==='en'?'Article not found':'文章不存在',description:locale==='en'?'This article does not exist or is not public.':'这篇文章不存在或未公开。',robots:'noindex, nofollow'}};}
  if(/^\/updates\/[1-9]\d*$/.test(pathname)){const [[update]]=await db.query("SELECT id,content,image_url FROM updates WHERE id=? AND status='published'",[pathname.split('/').pop()]);if(update)return {status:200,meta:seo.updateMeta(await contentTranslations.localize(db,'update',update,locale,{strict:true}),brand)};return {status:404,meta:{...seo.baseMeta(pathname,brand),title:locale==='en'?'Update not found':'近况不存在',robots:'noindex, nofollow'}};}
  if(/^\/projects\/[a-zA-Z0-9_-]+$/.test(pathname)){const [[project]]=await db.query("SELECT id,slug,name,summary,content,cover_image FROM projects WHERE slug=? AND status='published'",[pathname.split('/').pop()]);if(project)return {status:200,meta:seo.projectMeta(await contentTranslations.localize(db,'project',project,locale,{strict:true}),brand)};return {status:404,meta:{...seo.baseMeta(pathname,brand),title:locale==='en'?'Project not found':'作品不存在',robots:'noindex, nofollow'}};}
  if(pathname.startsWith('/category/')){let category;try{category=decodeURIComponent(pathname.slice('/category/'.length));}catch{}if(category&&category.length<=100&&!/[\/#?]/.test(category)){const [[row]]=await db.query("SELECT category FROM posts WHERE status='published' AND category=? LIMIT 1",[category]);if(row){const label=await contentTranslations.localize(db,'category',{name:row.category},locale,{id:row.category});let meta=seo.categoryMeta(row.category,brand);if(locale==='en')meta={...meta,title:`${label.name} · Category · ${meta.siteName}`,description:`Browse articles in ${label.name} on ${meta.siteName}.`};return {status:200,meta};}}return {status:404,meta:{...seo.baseMeta(pathname,brand),title:locale==='en'?'Category not found':'分类不存在',robots:'noindex, nofollow'}};}
  if(pathname==='/search')return {status:200,meta:{...base(),title:locale==='en'?'Search · mooncci':'搜索 · mooncci',description:locale==='en'?'Search published articles.':'搜索公开文章。',robots:'noindex, follow'}};
  if(pathname==='/node-monitor')return {status:200,meta:{...seo.baseMeta(pathname,brand),title:'节点监控 · mooncci',robots:'noindex, nofollow'}};
  return {status:200,meta:seo.baseMeta(pathname,brand)};
 }
 async function metadata(pathname,query={}) {
  if(!/^\/en(?:\/|$)/.test(pathname)&&pathname!=='/search'&&documents.privateRoutes.test(pathname)){
   const result=await baseMetadata(pathname);const language=query.locale==='en'?'en':'zh-CN';
   const labels={'/login':['登录','Sign in'],'/admin-login':['管理员登录','Administrator sign in'],'/register':['注册','Register'],'/forgot-password':['忘记密码','Forgot password'],'/reset-password':['重置密码','Reset password'],'/complete-registration':['完成注册','Complete registration'],'/electricity':['宿舍电量监控','Electricity monitor'],'/node-monitor':['节点监控','Node monitor'],'/diagnostics':['诊断','Diagnostics']};
   const label=labels[pathname]||(pathname.startsWith('/admin')?['管理后台','Administration']:pathname.startsWith('/account')?['个人中心','Account']:['订阅设置','Subscription settings']);
   result.meta={...result.meta,locale:language,title:`${label[language==='en'?1:0]} · ${result.meta.siteName}`,description:language==='en'?'Account and site services.':'账户与站点服务。',canonical:seo.origin()+pathname,robots:'noindex, follow',alternates:[]};return result;
  }
  const locale=/^\/en(?:\/|$)/.test(pathname)?'en':'zh-CN';
  pathname=pathname.replace(/^\/en(?=\/|$)/,'')||'/';
  let result;try{result=await baseMetadata(pathname,locale);}catch(error){if(error.status!==404)throw error;result={status:404,meta:{...seo.baseMeta(pathname),title:'English translation unavailable',description:'This content has no published English translation.',robots:'noindex, nofollow'}};}
  if(!pathname.startsWith('/article/'))result.meta=seo.localizeMeta(result.meta,pathname,locale);
  if(locale==='en'&&result.status===404&&/\p{Script=Han}/u.test(result.meta.description||''))result.meta.description='This page does not exist or has no published English translation.';
  const notFound=()=>({status:404,meta:{...seo.localizeMeta(seo.baseMeta(pathname),pathname,locale),favicon:result.meta.favicon,title:locale==='en'?'Page not found':'页面不存在',description:locale==='en'?'This page does not exist or is not public.':'页面不存在或未公开。',robots:'noindex, nofollow',alternates:[]}});
  if(pathname.startsWith('/updates/')&&!/^\/updates\/[1-9]\d*$/.test(pathname))return notFound();
  if(!documents.publicRoutes.test(pathname)&&!documents.privateRoutes.test(pathname)) return notFound();
  if(locale==='en'&&pathname!=='/search'&&documents.privateRoutes.test(pathname))return notFound();
  if((pathname==='/series'||pathname.startsWith('/series/'))&&process.env.PUBLISHING_ENABLED!=='true')return notFound();
  if(/^\/(tag|series)\//.test(pathname)) {
   let name;try{name=decodeURIComponent(pathname.split('/').pop());}catch{return notFound();}
   if(!name||name.length>100||/[\/#?]/.test(name))return notFound();
   if(pathname.startsWith('/tag/')) {
    const [rows]=await db.query("SELECT tags FROM posts WHERE status='published' AND tags IS NOT NULL");
    if(!rows.some(row=>{try{return (Array.isArray(row.tags)?row.tags:JSON.parse(row.tags||'[]')).includes(name);}catch{return false;}}))return notFound();
    result.meta={...result.meta,title:`${name} · ${locale==='en'?'Tag':'标签'} · ${result.meta.siteName}`,description:locale==='en'?`Browse articles tagged ${name} on ${result.meta.siteName}.`: `浏览 ${result.meta.siteName} 中带有「${name}」标签的文章，阅读相关技术实践与经验记录。进入文章查看完整正文，或结合分类与归档继续查找感兴趣的内容。`,robots:'index, follow'};
   } else {
    const [[series]]=await db.query("SELECT s.* FROM article_series s JOIN article_series_posts sp ON sp.series_id=s.id JOIN posts p ON p.id=sp.post_id AND p.status='published' WHERE s.slug=? LIMIT 1",[name]);
    if(!series)return notFound();
    let localized;try{localized=await contentTranslations.localize(db,'series',series,locale,{strict:true});}catch(error){if(error.status===404)return notFound();throw error;}
    Object.assign(series,localized);
    result.meta.alternates=seo.alternateLinks(pathname,localized.available_locales);
    result.meta={...result.meta,title:`${series.title} · ${locale==='en'?'Series':'专栏'} · ${result.meta.siteName}`,description:seo.plain(series.description).slice(0,160)||(locale==='en'?`Read the ${series.title} series on ${result.meta.siteName}.`:`连续阅读 ${result.meta.siteName} 的「${series.title}」文章专栏，浏览这一主题的文章目录与相关实践记录。按专栏顺序进入文章，查看完整正文与主题进展。`),robots:'index, follow'};
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
   if(locale==='en')resource+=(resource.includes('?')?'&':'?')+'locale=en';
   const data=await loadResource(resource);if(page>Math.max(1,Math.ceil(data.total/data.pageSize)))return notFound();
  }
  if(pathname==='/updates'&&query.type){
   const label=(locale==='en'?{post:'Articles',update:'Personal updates',release:'Project releases'}:{post:'文章',update:'日常近况',release:'作品版本'})[query.type];
   if(!label)return notFound();
   result.meta.title=`${label}${locale==='en'?'':'更新'} · ${result.meta.siteName}`;
   result.meta.description=locale==='en'?`Browse recent ${label.toLowerCase()} from ${result.meta.siteName}.`:`浏览 ${result.meta.siteName} 最近的${label}更新，查看这一类型的动态与发布时间。进入相关内容阅读详情，也可以切换到全部近况，跟进博客文章、日常记录和作品进展。`;
  }
  if(result.status!==200)result.meta.alternates=[];
  if(locale==='en'&&result.status===404){result.meta.title='Page not found';result.meta.description='This page does not exist or is not public.';}
  if(page>1){result.meta.canonical+='?page='+page;result.meta.title+=locale==='en'?` · Page ${page}`:` · 第 ${page} 页`;result.meta.description=(locale==='en'?`Page ${page}: `:`第 ${page} 页：`)+result.meta.description;}
  if(query.type && pathname==='/updates') {if(!['post','update','release'].includes(query.type))return notFound();result.meta.canonical+=(page>1?'&':'?')+'type='+query.type;}
  if(result.meta.alternates){const suffix=new URL(result.meta.canonical).search;result.meta.alternates=result.meta.alternates.map(link=>({...link,href:link.href+suffix}));}
  if(result.status===200&&result.meta.robots==='index, follow') {
   const graph=[];
   if(result.meta.jsonLd)graph.push(result.meta.jsonLd);
   if(pathname==='/')graph.push({'@type':'WebSite',inLanguage:locale,'@id':result.meta.canonical+'#website',url:result.meta.canonical,name:result.meta.siteName});
   else graph.push({'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:locale==='en'?'Home':'首页',item:seo.origin()+seo.localizedPath('/',locale)},{'@type':'ListItem',position:2,name:result.meta.title.split(' · ')[0],item:result.meta.canonical}]});
   result.meta.jsonLd={'@context':'https://schema.org','@graph':graph};
  }
  return result;
 }
 router.get('/api/seo',limiter,async(req,res)=>{const pathname=String(req.query.path||'/');if(!/^\/[a-zA-Z0-9/_%:.\-]*$/.test(pathname)||pathname.length>512)return res.status(400).json({message:'无效页面地址'});const result=await metadata(pathname,req.query);res.set('Cache-Control','no-store');res.status(result.status).json(result.meta);});
 router.get('/robots.txt',limiter,(_req,res)=>{res.type('text/plain').send(`User-agent: *\nDisallow: /api/\nDisallow: /api/uploads/releases/\nAllow: /api/uploads/*.jpg$\nAllow: /api/uploads/*.jpeg$\nAllow: /api/uploads/*.png$\nAllow: /api/uploads/*.gif$\nAllow: /api/uploads/*.webp$\nAllow: /api/uploads/*.ico$\nAllow: /api/image-variants/\nAllow: /api/posts\nAllow: /api/projects\nAllow: /api/updates/\nAllow: /api/activity\nAllow: /api/now$\nAllow: /api/settings/site$\nAllow: /api/settings/blog-pages$\nAllow: /api/publishing/config$\nAllow: /api/subscriptions/status$\nAllow: /api/series\nAllow: /api/seo?\nSitemap: ${seo.origin()}/sitemap.xml\n`);});
 router.get('/sitemap.xml',limiter,async(_req,res)=>{
  const [posts]=await db.query("SELECT id,slug,COALESCE(updated_at,published_at,created_at) AS updated_at FROM posts WHERE status='published' ORDER BY id");
  const [updates]=await db.query("SELECT id,updated_at FROM updates WHERE status='published' ORDER BY id");
  const [projects]=await db.query("SELECT slug,updated_at FROM projects WHERE status='published' ORDER BY id");
  const [categories]=await db.query("SELECT DISTINCT category FROM posts WHERE status='published' AND category<>'' ORDER BY category");
  const [tagRows]=await db.query("SELECT tags FROM posts WHERE status='published' AND tags IS NOT NULL");
  const tags=new Set();for(const row of tagRows){try{for(const tag of (Array.isArray(row.tags)?row.tags:JSON.parse(row.tags||'[]')))if(typeof tag==='string'&&tag)tags.add(tag);}catch{}}
  const [series]=await db.query("SELECT s.slug,MAX(p.updated_at) AS updated_at FROM article_series s JOIN article_series_posts sp ON sp.series_id=s.id JOIN posts p ON p.id=sp.post_id AND p.status='published' GROUP BY s.id,s.slug");
  let translated=[];try{[translated]=await db.query("SELECT p.id,p.slug,t.updated_at FROM post_translations t JOIN posts p ON p.id=t.post_id WHERE p.status='published' AND t.status='published' AND t.locale='en'");}catch(error){if(error.code!=='ER_NO_SUCH_TABLE')throw error;}
  let translatedContent=[];try{[translatedContent]=await db.query("SELECT t.entity_type,t.entity_id,t.published_at,t.published,t.published_source,p.name,p.summary,p.content AS project_content,u.content AS update_content,s.title,s.description, COALESCE(p.slug,s.slug) AS slug FROM content_translations t LEFT JOIN projects p ON t.entity_type='project' AND p.id=t.entity_id AND p.status='published' LEFT JOIN updates u ON t.entity_type='update' AND u.id=t.entity_id AND u.status='published' LEFT JOIN article_series s ON t.entity_type='series' AND s.id=t.entity_id WHERE t.locale='en' AND t.published IS NOT NULL AND ((t.entity_type='project' AND p.id IS NOT NULL) OR (t.entity_type='update' AND u.id IS NOT NULL) OR (t.entity_type='series' AND s.id IS NOT NULL AND EXISTS (SELECT 1 FROM article_series_posts sp JOIN posts pub ON pub.id=sp.post_id AND pub.status='published' WHERE sp.series_id=s.id)))");}catch(error){if(error.code!=='ER_NO_SUCH_TABLE')throw error;}
  const rows=[...translatedContent.filter(row=>{if(row.entity_type==='series'&&process.env.PUBLISHING_ENABLED!=='true')return false;const source=row.entity_type==='project'?{name:row.name,summary:row.summary,content:row.project_content}:row.entity_type==='update'?{content:row.update_content}:{title:row.title,description:row.description};const parse=value=>typeof value==='string'?JSON.parse(value):value;return !contentTranslations.missingText(row.entity_type,source,parse(row.published),parse(row.published_source)).length;}).map(row=>({path:seo.localizedPath(row.entity_type==='project'?'/projects/'+encodeURIComponent(row.slug):row.entity_type==='series'?'/series/'+encodeURIComponent(row.slug):'/updates/'+row.entity_id,'en'),updated_at:row.published_at})),...translated.map(p=>({path:seo.localizedPath(articlePath(p),'en'),updated_at:p.updated_at})),...Object.keys(seo.titles).filter(path=>path!=='/series'||process.env.PUBLISHING_ENABLED==='true').map(path=>({path:seo.localizedPath(path,'en')})),...[...tags].map(tag=>({path:`/tag/${encodeURIComponent(tag)}`})),...series.filter(()=>process.env.PUBLISHING_ENABLED==='true').map(s=>({path:`/series/${encodeURIComponent(s.slug)}`,updated_at:s.updated_at})),...Object.keys(seo.titles).filter(path=>path!=='/series'||process.env.PUBLISHING_ENABLED==='true').map(path=>({path})),...posts.map(p=>({path:articlePath(p),updated_at:p.updated_at})),...updates.map(p=>({path:`/updates/${p.id}`,updated_at:p.updated_at})),...projects.map(p=>({path:`/projects/${encodeURIComponent(p.slug)}`,updated_at:p.updated_at})),...categories.map(p=>({path:`/category/${encodeURIComponent(p.category)}`}))];
  res.set('Cache-Control','no-store').type('application/xml').send(seo.sitemap(rows));
 });
 router.get('*',(req,res,next)=>{
  if(req.path.startsWith('/api/')||req.path.startsWith('/assets/')||req.path.startsWith('/uploads/')||(!/^\/(?:en\/)?article\//.test(req.path)&&/\.[a-z0-9]+$/i.test(req.path)))return next('route');
  return limiter(req,res,next);
 },require('../lib/anonymousHomeCache').createAnonymousHomeCache(),async(req,res,next)=>{
  const pathname=req.path.replace(/\/$/,'')||'/';
  const english=/^\/en(?:\/|$)/.test(pathname);
  let html;
  try {
   html=await readTemplate();
   if(!html.includes('</head>')||!html.includes('id="root"'))throw Error('Invalid HTML template');
   let result=await metadata(pathname,req.query);
   res.set('Cache-Control','private, no-store');
   if(result.meta.robots.startsWith('noindex'))res.set('X-Robots-Tag',result.meta.robots);
   if(result.redirect)return res.redirect(301,result.redirect+(req.originalUrl.includes('?')?req.originalUrl.slice(req.originalUrl.indexOf('?')):''));
   // Authenticated draft reads stay on the existing authenticated browser API path.
   if(result.status===404&&/^\/(?:en\/)?article\//.test(pathname)&&req.headers.cookie)return res.status(404).set('X-Robots-Tag','noindex, nofollow').type('html').send(seo.renderHtml(html,result.meta));
   if(documents.privateRoutes.test(pathname)&&!['/search','/en/search'].includes(pathname))return res.status(result.status).set('X-Robots-Tag','noindex, follow').type('html').send(seo.renderHtml(html,result.meta));
   const resources=new Map();
   const load=value=>{if(!resources.has(value))resources.set(value,loadResource(value,req.ip));return resources.get(value);};
   const query=new URLSearchParams();for(const key of ['page','type','release','q','category','tag'])if(typeof req.query[key]==='string')query.set(key,req.query[key]);
   const renderUrl=pathname+(query.size?'?'+query:'');
   let rendered=await renderDocument(renderUrl,load,result.status);
   const invalid=Object.values(rendered.data.resources).some(data=>data&&Number.isFinite(data.total)&&data.page>Math.max(1,Math.ceil(data.total/data.pageSize)));
   if(invalid||Object.values(rendered.data.errors||{}).includes(404)) {
    result={status:404,meta:{...seo.baseMeta(pathname),favicon:result.meta.favicon,title:english?'Page not found':'页面不存在',locale:english?'en':'zh-CN',robots:'noindex, nofollow'}};
    rendered=await renderDocument(renderUrl,load,404);
   }
   rendered.data.status=result.status;
   if(result.status!==200)res.set('X-Robots-Tag','noindex, nofollow');
   html=await injectDocument(html,{...rendered,data:{...rendered.data,seo:result.meta}});
   res.locals.publicHomeComplete=result.status===200 && Object.keys(rendered.data.errors||{}).length===0;
   res.status(result.status).type('html').send(seo.renderHtml(html,result.meta));
  } catch(error) {
   console.error('[seo/document]',error.message);
   res.status(503).set('Cache-Control','no-store').set('X-Robots-Tag','noindex').type('html');
   try {
    if(!html)throw Error('Template unavailable');
    const failure=await renderDocument(pathname,async value=>value.split('?')[0]==='/settings/site'?{brand:{site_title:'mooncci'},hero:{},footer:{}}:{enabled:false},503);
    return res.send(seo.renderHtml(await injectDocument(html,failure),{...seo.baseMeta(pathname),title:english?'Page temporarily unavailable · mooncci':'页面暂时无法加载 · mooncci',description:english?'Please try again later.':'请稍后重新加载。',locale:english?'en':'zh-CN',robots:'noindex, nofollow'}));
   } catch { return res.send(english?'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Temporarily unavailable · mooncci</title><body><main><h1>This page is temporarily unavailable</h1><p>Please try again later.</p><a href="/en">Home</a></main></body></html>':'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>暂时无法加载 · mooncci</title><body><main><h1>页面暂时无法加载</h1><p>请稍后重新加载。</p><a href="/">返回首页</a></main></body></html>'); }

  }
 });return router;
}
module.exports={createSeoRouter};
