const revisions = require('./articleRevisions');
const proof = require('./articleSummaryProof');

// Include working copies and history: a hidden reference can become public later.
const sources = [
  ['posts', ['content', 'cover_image']],
  ['site_settings', ['setting_value']],
  ['updates', ['content', 'image_url']],
  ['projects', ['content', 'cover_image', 'icon_image']],
  ['site_now', ['content']],
  ['article_series', ['cover_image']],
  ['article_drafts', ['payload']],
  ['article_revisions', ['payload']],
  ['article_workflows', ['snapshot']],
];
const matches = fields => fields.map(field => `LOCATE(?, CAST(${field} AS CHAR)) > 0`).join(' OR ');
async function countReferences(db, url) {
  let total = 0;
  for (const [table, fields] of sources) {
    const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${matches(fields)}`, fields.map(() => url));
    total += Number(row.count || 0);
  }
  return total;
}
function remap(value, oldUrl, newUrl) {
  if (typeof value === 'string') return value.split(oldUrl).join(newUrl);
  if (Array.isArray(value)) return value.map(item => remap(item, oldUrl, newUrl));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item, oldUrl, newUrl)]));
  return value;
}
function remapPayload(raw, oldUrl, newUrl) {
  const before = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const next = remap(before, oldUrl, newUrl);
  // Re-sign only an already valid description. A filename change does not edit
  // editorial content, and must not silently approve an invalid AI description.
  if (next?.summary_mode === 'ai' && proof.valid(before)) next.summary_receipt = proof.signature(next);
  return next;
}
async function updateReferences(c, oldUrl, newUrl, actorId) {
  if (oldUrl === newUrl) return;
  // Use the same lock order as publishing: working copy, workflow, public post.
  const [drafts] = await c.query(`SELECT * FROM article_drafts WHERE ${matches(['payload'])} OR post_id IN (SELECT id FROM posts WHERE ${matches(['content', 'cover_image'])}) ORDER BY id FOR UPDATE`, [oldUrl, oldUrl, oldUrl]);
  const [workflows] = await c.query(`SELECT * FROM article_workflows WHERE ${matches(['snapshot'])}${drafts.length ? ' OR draft_id IN (?)' : ''} ORDER BY draft_id FOR UPDATE`, [oldUrl, ...(drafts.length ? [drafts.map(d => d.id)] : [])]);
  const [posts] = await c.query(`SELECT * FROM posts WHERE ${matches(['content', 'cover_image'])} ORDER BY id FOR UPDATE`, [oldUrl, oldUrl]);
  for (const post of posts) {
    await revisions.baseline(c, post, actorId);
    const next = remap(post, oldUrl, newUrl);
    await c.query('UPDATE posts SET content=?,cover_image=?,version=version+1,updated_at=NOW() WHERE id=?', [next.content, next.cover_image, post.id]);
    await revisions.record(c, {post_id:post.id}, next, post.status === 'published' ? 'publish' : 'manual', actorId, post.status === 'published' ? post.version + 1 : null);
  }
  for (const draft of drafts) {
    const next = remapPayload(draft.payload, oldUrl, newUrl);
    const changed = JSON.stringify(next) !== JSON.stringify(typeof draft.payload === 'string' ? JSON.parse(draft.payload) : draft.payload);
    const post = posts.find(p => Number(p.id) === Number(draft.post_id));
    const base = post && draft.base_version === post.version ? post.version + 1 : draft.base_version;
    const published = changed && draft.published_version === draft.version ? draft.version + 1 : draft.published_version;
    await c.query('UPDATE article_drafts SET payload=?,base_version=?,version=version+?,published_version=? WHERE id=?', [JSON.stringify(next), base, Number(changed), published, draft.id]);
    const workflow = workflows.find(w => w.draft_id === draft.id);
    if (workflow && changed && workflow.draft_version === draft.version) workflow.draft_version++;
  }
  for (const workflow of workflows) {
    await c.query('UPDATE article_workflows SET snapshot=?,draft_version=? WHERE draft_id=?', [JSON.stringify(remapPayload(workflow.snapshot, oldUrl, newUrl)), workflow.draft_version, workflow.draft_id]);
  }
  // Preserve history timestamps and publication identity; only remap this asset.
  const [history] = await c.query(`SELECT id,payload FROM article_revisions WHERE ${matches(['payload'])} ORDER BY id FOR UPDATE`, [oldUrl]);
  for (const row of history) {
    const next = remapPayload(row.payload, oldUrl, newUrl);
    await c.query('UPDATE article_revisions SET payload=?,content_hash=? WHERE id=?', [JSON.stringify(next), revisions.hash(next), row.id]);
  }
  for (const [table, fields] of sources.filter(([table]) => ['site_settings','updates','projects','site_now','article_series'].includes(table))) {
    await c.query(`UPDATE ${table} SET ${fields.map(field => `${field}=REPLACE(${field}, ?, ?)`).join(',')} WHERE ${matches(fields)}`, [...fields.flatMap(() => [oldUrl, newUrl]), ...fields.map(() => oldUrl)]);
  }
}
module.exports = { countReferences, updateReferences, remapPayload };
