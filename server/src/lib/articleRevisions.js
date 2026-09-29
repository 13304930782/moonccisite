const crypto = require('node:crypto');
const fields = ['title','slug','summary','content','cover_image','category','source_url'];
function snapshot(input = {}) {
  const out = Object.fromEntries(fields.map(k => [k,String(input[k] ?? '')]));
  let tags = input.tags; if (typeof tags === 'string') { try { tags = JSON.parse(tags); } catch { tags = []; } }
  out.tags = Array.isArray(tags) ? tags.map(String) : [];
  return out;
}
const hash = p => crypto.createHash('sha256').update(JSON.stringify(snapshot(p))).digest('hex');
const scope = d => d.post_id ? ['post_id=?',[d.post_id]] : ['post_id IS NULL AND draft_id=?',[d.id]];
async function record(c,d,input,kind,actor,version=null,clock=Date.now()) {
  const p=snapshot(input), digest=hash(p), [where,args]=scope(d);
  // A parent draft/post row must be locked by the caller before recording.
  if (kind === 'auto') {
    const bucket=Math.floor(clock/300000);
    const [[row]]=await c.query(`SELECT id FROM article_revisions WHERE ${where} AND kind='auto' AND auto_bucket=? ORDER BY id DESC LIMIT 1`,[...args,bucket]);
    if(row) { await c.query('UPDATE article_revisions SET payload=?,content_hash=?,actor_id=?,updated_at=NOW(3) WHERE id=?',[JSON.stringify(p),digest,actor,row.id]); return row.id; }
  } else if (kind !== 'baseline' && kind !== 'restore') {
    const [[row]]=await c.query(`SELECT content_hash FROM article_revisions WHERE ${where} AND ${kind==='manual'?"kind IN ('manual','publish','baseline','restore')":'kind=?'} ORDER BY id DESC LIMIT 1`,kind==='manual'?args:[...args,kind]);
    if(row?.content_hash===digest)return null;
  }
  const [r]=await c.query('INSERT INTO article_revisions(post_id,draft_id,actor_id,kind,payload,content_hash,published_version,auto_bucket) VALUES (?,?,?,?,?,?,?,?)',[d.post_id||null,d.id||null,actor,kind,JSON.stringify(p),digest,version,kind==='auto'?Math.floor(clock/300000):null]);
  return r.insertId;
}
async function baseline(c,post,actor) {
  const [[existing]]=await c.query('SELECT id FROM article_revisions WHERE post_id=? LIMIT 1',[post.id]);
  if (!existing) await record(c,{post_id:post.id},post,'baseline',actor,post.version);
}
async function trimAutos(c,d) {
 const [where,args]=scope(d);
 await c.query(`DELETE FROM article_revisions WHERE ${where} AND kind='auto' AND updated_at < DATE_SUB(NOW(),INTERVAL 30 DAY)`,args);
 const [[cut]]=await c.query(`SELECT id FROM article_revisions WHERE ${where} AND kind='auto' ORDER BY id DESC LIMIT 1 OFFSET 199`,args);
 if(cut)await c.query(`DELETE FROM article_revisions WHERE ${where} AND kind='auto' AND id<?`,[...args,cut.id]);
}
async function cleanup(db) {
 await db.query("DELETE FROM article_revisions WHERE kind='auto' AND updated_at < DATE_SUB(NOW(),INTERVAL 30 DAY)");
 // The per-document cap is also enforced in the save transaction.
 const [rows]=await db.query("SELECT post_id,draft_id FROM article_revisions WHERE kind='auto' GROUP BY post_id,draft_id HAVING COUNT(*)>200");
 for(const row of rows)await trimAutos(db,{post_id:row.post_id,id:row.draft_id});
}
module.exports={snapshot,hash,scope,record,baseline,trimAutos,cleanup};
