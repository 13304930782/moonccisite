const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {JSDOM} = require('jsdom');
const {origin} = require('./seo');
const {articlePath} = require('./articleSlug');
const reportDir = () => process.env.MOONCCI_PUBLICATION_CHECK_DIR || path.resolve(__dirname, '../../publication-checks');
const bridgeDir = () => process.env.MOONCCI_INDEXNOW_ADMIN_DIR || '/var/lib/mooncci-indexnow-admin';
const fail = (message,status=503) => Object.assign(new Error(message),{status});
async function readJson(file,max=1048576) {
 const stat=await fs.lstat(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)throw Error('Invalid status file');
 return JSON.parse(await fs.readFile(file,'utf8'));
}
async function atomic(file,value) {
 await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
 const temporary=file+'.'+crypto.randomUUID()+'.tmp';
 try {await fs.writeFile(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'});await fs.rename(temporary,file);}
 finally {await fs.unlink(temporary).catch(()=>{});}
}
function analyzeHtml(html,url,status,headers={}) {
 const issues=[];
 const add=(code,message,severity='error')=>issues.push({code,message,severity});
 if(status!==200)add('http',`页面返回 HTTP ${status}，预期为 200。`);
 if(!String(headers['content-type']||'').includes('text/html'))add('content-type','响应不是 HTML 页面。');
 const dom=new JSDOM(html),document=dom.window.document;
 try {
 const titles=document.querySelectorAll('title');
 if(titles.length!==1||!titles[0].textContent.trim())add('title','页面应有一个非空标题。');
 const canonical=document.querySelectorAll('link[rel~="canonical"]');
 if(canonical.length!==1||canonical[0].getAttribute('href')!==url)add('canonical','规范链接与当前文章地址不一致。');
 const robots=[headers['x-robots-tag']||'',...Array.from(document.querySelectorAll('meta[name]')).filter(n=>['robots','bingbot'].includes(n.getAttribute('name').toLowerCase())).map(n=>n.getAttribute('content')||'')].join(',');
 if(/\b(noindex|none)\b/i.test(robots))add('noindex','页面禁止搜索引擎收录。');
 const count=document.querySelectorAll('h1').length;
 if(count!==1)add('h1',`页面包含 ${count} 个 H1，预期为 1 个。`);
 const images=Array.from(document.querySelectorAll('img'));
 const missing=images.filter(n=>!n.hasAttribute('alt')).length;
 const empty=images.filter(n=>n.hasAttribute('alt')&&!n.getAttribute('alt').trim()&&!['none','presentation'].includes(n.getAttribute('role'))&&n.getAttribute('aria-hidden')!=='true').length;
 if(missing)add('alt-missing',`${missing} 张图片缺少 alt 属性。`,'warning');
 if(empty)add('alt-review',`${empty} 张图片使用空 alt，请确认它们是装饰图片。`,'warning');
 return {issues,title:titles[0]?.textContent.trim()||'',h1Count:count};
 } finally {dom.window.close();}
}
async function fetchDocument(url,fetcher=fetch) {
 const response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'mooncci-publication-check/1.0','Accept':'text/html','Cache-Control':'no-cache'}});
 let size=0;const chunks=[];
 if(response.body)for await(const chunk of response.body){size+=chunk.length;if(size>2097152){throw Error('页面超过 2 MiB 检查上限。');}chunks.push(Buffer.from(chunk));}
 return {html:Buffer.concat(chunks).toString('utf8'),status:response.status,headers:{'content-type':response.headers.get('content-type'),'x-robots-tag':response.headers.get('x-robots-tag')}};
}
const inFlight=new Set();
async function checkPost(post,actorId,fetcher=fetch) {
 if(post.status!=='published')throw fail('只能检查公开文章。',409);
 if(inFlight.has(post.id))throw fail('这篇文章正在检查，请稍后刷新。',409);
 inFlight.add(post.id);
 try {
 const url=origin()+articlePath(post);
 const report={postId:post.id,version:post.version,url,checkedAt:new Date().toISOString(),actorId};
 try {const response=await fetchDocument(url,fetcher);Object.assign(report,{http:response.status,...analyzeHtml(response.html,url,response.status,response.headers)});}
 catch(error){report.http=null;report.issues=[{code:'request',severity:'error',message:error.name==='TimeoutError'?'页面请求超过 15 秒。':'无法取得完整页面，请检查网站连通性后重试。'}];}
 report.state=report.issues.some(i=>i.severity==='error')?'failed':report.issues.length?'warning':'passed';
 await atomic(path.join(reportDir(),String(post.id)+'.json'),report);
 return report;
 } finally {inFlight.delete(post.id);}
}
async function postReports(posts) {
 return Promise.all(posts.map(async p=>{
 let report=null;
 try {report=await readJson(path.join(reportDir(),String(p.id)+'.json'),65536);}catch{}
 const url=origin()+articlePath(p);
 return {...p,url,report,stale:!!report&&(report.version!==p.version||report.url!==url)};
 }));
}
async function indexNowStatus() {
 try {
 const s=await readJson(path.join(bridgeDir(),'status.json'));
 if(s.version!==1||s.origin!==origin()||!Number.isFinite(Date.parse(s.checkedAt)))return {state:'invalid',message:'IndexNow 状态格式或站点域名不匹配。'};
 const age=Date.now()-Date.parse(s.checkedAt);
 // Producer exports only this public operational schema, never its key or private queue file.
 return {state:age<0||age>900000?'stale':'available',checkedAt:s.checkedAt,origin:s.origin,endpoint:s.endpoint,pendingCount:s.pendingCount,blocked:s.blocked,nextRetryAt:s.nextRetryAt,lastRun:s.lastRun,lastValidSitemapAt:s.lastValidSitemapAt,pendingUrls:s.pendingUrls,receipts:Array.isArray(s.receipts)?s.receipts.slice(-20):[],requests:Array.isArray(s.requests)?s.requests.slice(-100):[]};
 } catch(error){return {state:error.code==='ENOENT'?'unavailable':'invalid',message:'尚未取得 IndexNow 状态，请检查定时任务和状态目录配置。'};}
}
async function queueIndexNow(post,actorId,action='submit') {
 if(post.status!=='published'||!['submit','retry'].includes(action))throw fail('只能提交当前公开文章。',400);
 const url=origin()+articlePath(post),status=await indexNowStatus();
 if(status.state!=='available')throw fail('IndexNow 状态不可用或已过期，请先恢复定时任务。');
 const recent=(status.requests||[]).find(r=>r.url===url&&Date.now()-Date.parse(r.requestedAt)<900000);
 if(recent)throw fail('这篇文章最近已请求提交，请等待 15 分钟后再试。',429);
 const dir=path.join(bridgeDir(),'requests');
 if((await fs.readdir(dir)).length>=100)throw fail('请求队列已满，请等待任务处理。',429);
 const request={version:1,action,url,requestedAt:new Date().toISOString(),actorId};
 const file=path.join(dir,crypto.createHash('sha256').update(url).digest('hex')+'.json');
 // Publish a complete file exclusively: the root consumer must never see a partial request.
 const temporary=path.join(dir,crypto.randomUUID()+'.tmp');
 try {await fs.writeFile(temporary,JSON.stringify(request),{flag:'wx',mode:0o600});await fs.link(temporary,file);}
 catch(error){if(error.code==='EEXIST')throw fail('这篇文章已在提交队列中。',409);throw error;}
 finally {await fs.unlink(temporary).catch(()=>{});}
 return {message:'已排队，定时任务验证后提交；接收成功不代表已收录。',request};
}
module.exports={analyzeHtml,fetchDocument,checkPost,postReports,indexNowStatus,queueIndexNow};
