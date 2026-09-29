const revisions=require('./articleRevisions');
const {isAdminLike}=require('../middleware/auth');
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const allowed=(user,row)=>isAdminLike(user)||Number(user.id)===Number(row.author_id);
const keys=['title','slug','summary','content','cover_image','category'];
function payload(input={}) {
  const p=Object.fromEntries(keys.map(k=>[k,String(input[k]??'')]));
  p.tags=Array.isArray(input.tags)?input.tags.map(String).map(x=>x.trim()).filter(Boolean).slice(0,20):[];
  if(p.title.length>255||p.slug.length>255||p.category.length>100||p.cover_image.length>500||p.content.length>500000||p.summary.length>10000)throw error('内容超出长度限制。');
  p.published_at=input.published_at instanceof Date ? input.published_at.toISOString().slice(0,19).replace('T',' ') : String(input.published_at||'').replace('T',' ');
 if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p.published_at))p.published_at=p.published_at.slice(0,19);
 if(p.published_at && (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(p.published_at)||!Number.isFinite(Date.parse(p.published_at.replace(' ','T')))))throw error('原始发布时间无效。');
 p.source_url=String(input.source_url||'').slice(0,1000);
 return p;
}
const fields=p=>[p.title.trim(),p.slug.trim(),p.summary,p.content,p.cover_image,p.category,JSON.stringify(p.tags)];
async function publish(c,d,user) {
    const p=payload(d.payload);if(!p.title.trim()||!p.content.trim())throw error('发布前请填写标题和正文。');
    if(!p.slug.trim())p.slug=`article-${d.id}`;
    let postId=d.post_id, nextVersion=1;
    if(postId){const [[post]]=await c.query('SELECT * FROM posts WHERE id=? FOR UPDATE',[postId]);if(!post||!allowed(user,post))throw error('无权限发布。',403);if(post.version!==d.base_version)throw error('公开文章已有新版本，请重新加载后编辑。',409);await revisions.baseline(c,post,user.id);nextVersion=post.version+1;await c.query('UPDATE posts SET title=?,slug=?,summary=?,content=?,cover_image=?,category=?,tags=?,status="published",published_at=COALESCE(published_at,NOW()),updated_at=NOW(),version=version+1 WHERE id=?',[...fields(p),postId]);}
    else {const [r]=await c.query('INSERT INTO posts(title,slug,summary,content,cover_image,category,tags,status,author_id,published_at) VALUES (?,?,?,?,?,?,?,"published",?,COALESCE(?,NOW()))',[...fields(p),d.author_id,p.published_at||null]);postId=r.insertId;}
    await c.query('UPDATE article_revisions SET post_id=? WHERE draft_id=? AND post_id IS NULL',[postId,d.id]);
    await revisions.record(c,{id:d.id,post_id:postId},p,'publish',user.id,nextVersion);
    await c.query('UPDATE article_drafts SET post_id=?,base_version=?,dirty=0,published_version=version WHERE id=?',[postId,nextVersion,d.id]);
await require('../services/engagement').workflowEvent(c,d,'published','',user.id);
return postId;
}
module.exports={payload,publish,error};
