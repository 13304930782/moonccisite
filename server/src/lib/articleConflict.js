const revisions = require('./articleRevisions');
const {payload,publish,error} = require('./articlePublishing');
const {isAdminLike} = require('../middleware/auth');
const workflow = require('../services/articleWorkflow');

const canPublish = user => isAdminLike(user) || (!workflow.enabled() && user.role === 'editor');
const postPayload = (post,draft) => payload({...post,tags:revisions.snapshot(post).tags,source_url:draft.payload.source_url});
async function loadPost(c,d,user) {
  if (!d.post_id) return null;
  const [[post]]=await c.query('SELECT * FROM posts WHERE id=? FOR UPDATE',[d.post_id]);
  if (!post || (!isAdminLike(user) && Number(post.author_id)!==Number(user.id))) throw error('文章不存在或无权限。',404);
  return post;
}
async function inspect(c,d,user) {
  const post=await loadPost(c,d,user);
  const [[actor]]=await c.query('SELECT u.username FROM article_revisions r LEFT JOIN users u ON u.id=r.actor_id WHERE r.draft_id=? ORDER BY r.id DESC LIMIT 1',[d.id]);
  return {draft:d,post:post?{id:post.id,version:post.version,updated_at:post.updated_at,status:post.status,payload:postPayload(post,d)}:null,
    last_recorded_by:actor?.username||null,can_publish:canPublish(user)};
}
async function resolve(c,d,user,input) {
  if (!['publish-current','keep-current','adopt-post','adopt-draft'].includes(input.choice)) throw error('请选择要保留的版本。');
  if (workflow.enabled()) await workflow.assertEditable(c,d);
  if (input.choice==='publish-current' && !canPublish(user)) throw error('当前账号没有直接发布权限。',403);
  const post=await loadPost(c,d,user);
  // Both versions must still match the comparison the user actually saw.
  if (!Number.isSafeInteger(input.draft_version) || d.version!==input.draft_version ||
      (post ? !Number.isSafeInteger(input.post_version)||post.version!==input.post_version : input.post_version!==null))
    throw error('对比期间内容又有更新，请重新获取版本后选择。',409);
  if (input.choice==='adopt-post' && !post) throw error('这份草稿还没有对应的网站文章。');
  if (!input.payload || typeof input.payload!=='object') throw error('当前编辑内容缺失，请保留内容后重试。');
  const current=payload(input.payload);
  // Preserve both the browser contents and the server draft before replacing either.
  await revisions.record(c,d,d.payload,'restore',user.id);
  if (revisions.hash(current)!==revisions.hash(d.payload)) await revisions.record(c,d,current,'restore',user.id);
  const selected=input.choice==='adopt-post'?postPayload(post,d):input.choice==='adopt-draft'?d.payload:current;
  // Adopting a server draft does not silently rebase it onto a newer public article.
  const base=input.choice==='adopt-draft'?d.base_version:post?.version??null;
  await c.query('UPDATE article_drafts SET payload=?,base_version=?,version=version+1,dirty=1,published_version=NULL WHERE id=?',[JSON.stringify(selected),base,d.id]);
  if (workflow.enabled()) await c.query("UPDATE article_workflows SET state='draft',reason='',scheduled_at=NULL WHERE draft_id=?",[d.id]);
  if (input.choice==='publish-current') {
    if (post) await revisions.record(c,d,post,'restore',user.id,post.version);
    await publish(c,{...d,payload:selected,version:d.version+1,base_version:base},user);
    if (workflow.enabled()) await c.query("UPDATE article_workflows SET state='published',reason='',scheduled_at=NULL WHERE draft_id=?",[d.id]);
  }
}
module.exports={inspect,resolve};
