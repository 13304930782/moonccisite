const crypto=require('node:crypto');
const fail=(message,status=400,code='INVALID_LOCALE')=>Object.assign(new Error(message),{status,code});
function locale(value){if(value==null||value==='')return 'zh-CN';if(value==='zh-CN'||value==='en')return value;throw fail('Unsupported language.');}
const sourceHash=p=>crypto.createHash('sha256').update(JSON.stringify(['title','summary','content'].map(k=>String(p[k]||'')))).digest('hex');
async function publicPosts(db,posts,requestedLocale,{strict=false}={}){
 const requested=locale(requestedLocale);if(!posts.length)return [];
 const [translations]=await db.query("SELECT * FROM post_translations WHERE post_id IN (?) AND locale='en' AND status='published'",[posts.map(p=>p.id)]).catch(e=>{if(e.code==='ER_NO_SUCH_TABLE')return [[]];throw e;});
 return posts.map(p=>{
  const t=p.status==='published'||p.status===undefined?translations.find(t=>Number(t.post_id)===Number(p.id)):null;
  const base={...p,requested_locale:requested,content_locale:'zh-CN',available_locales:t?['zh-CN','en']:['zh-CN']};
  if(requested!=='en')return base;
  if(!t){if(strict)throw fail('English translation unavailable.',404,'TRANSLATION_UNAVAILABLE');return base;}
  return {...base,title:t.title,summary:t.summary,content:t.content,summary_mode:'manual',content_locale:'en',source_published_at:p.published_at,source_updated_at:p.updated_at,published_at:t.published_at,updated_at:t.updated_at,translation_version:t.version};
 });
}
async function publicPost(db,post,requestedLocale,options={strict:true}){return (await publicPosts(db,[post],requestedLocale,options))[0];}
async function published(c,post,lock=false){const [[t]]=await c.query("SELECT * FROM post_translations WHERE post_id=? AND locale='en'"+(lock?' FOR UPDATE':''),[post.id]);return t?{...post,...t,id:post.id,locale:'en',summary_mode:'manual'}:{...post,title:'',summary:'',content:'',version:0,status:'draft',locale:'en',summary_mode:'manual'};}
async function publish(c,d,user){
 if(!d.post_id)throw fail('Save the original article before adding a translation.',409,'ORIGINAL_REQUIRED');
 const [[post]]=await c.query('SELECT * FROM posts WHERE id=? FOR UPDATE',[d.post_id]);
 if(!post||(!require('../middleware/auth').isAdminLike(user)&&Number(post.author_id)!==Number(user.id)))throw fail('Article not found.',404,'NOT_FOUND');
 const t=await published(c,post,true);if(t.version!==(d.base_version??0))throw fail('Translation changed. Reload before publishing.',409,'VERSION_CONFLICT');
 const p=d.payload;if(!p.title?.trim()||!p.content?.trim())throw fail('Title and content are required.',400,'CONTENT_REQUIRED');
 if(post.status!=='published')throw fail('Publish the original article first.',409,'ORIGINAL_NOT_PUBLISHED');
 await c.query("INSERT INTO post_translations(post_id,locale,title,summary,content,status,version,source_hash,published_at,updated_at) VALUES (?,'en',?,?,?,'published',1,?,NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE title=VALUES(title),summary=VALUES(summary),content=VALUES(content),status='published',version=version+1,source_hash=VALUES(source_hash),published_at=COALESCE(published_at,NOW(3)),updated_at=NOW(3)",[post.id,p.title.trim(),p.summary,p.content,d.source_hash||'']);
 await require('./articleRevisions').record(c,d,p,'publish',user.id,t.version+1);
 await c.query('UPDATE article_drafts SET base_version=?,dirty=0,published_version=version WHERE id=?',[t.version+1,d.id]);
 return post.id;
}
async function prepareSummary(db,p,userId,contentLocale){return locale(contentLocale)==='en'?{...p,summary_mode:'manual',summary_receipt:''}:require('../services/articleSummary').prepare(db,p,userId);}
module.exports={locale,sourceHash,publicPosts,publicPost,published,publish,prepareSummary};
