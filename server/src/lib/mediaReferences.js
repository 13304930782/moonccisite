const revisions = require('./articleRevisions');
const proof = require('./articleSummaryProof');
const {siteOrigin} = require('./siteIdentity');

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
const documentFields = ['content', 'cover_image'];
const payloadTables = ['article_drafts', 'article_revisions', 'article_workflows'];
const settingMediaFields = new Set([...documentFields, 'image_url', 'icon_image', 'logo_url', 'favicon_url', 'avatar_url', 'police_icon_url', 'avatar', 'icon', 'url', 'primary_link', 'secondary_link']);
const urlTokens = /(?<![\w:/\\.-])(?:https?:\/\/|\/\/|\/api\/uploads\/)[^\s"'`<>()[\]{}]+/gi;
const parsePayload = raw => typeof raw === 'string' ? JSON.parse(raw) : raw;
function localUrl(token, url) {
  const origin = siteOrigin();
  try {
    const parsed = new URL(token.replace(/,+$/, ''), origin);
    return token.includes(url) && !parsed.username && !parsed.password && parsed.origin === origin && parsed.pathname === url;
  } catch { return false; }
}
function references(value, url) {
  return typeof value === 'string' && [...value.matchAll(urlTokens)].some(([token]) => localUrl(token, url));
}
function remap(value, oldUrl, newUrl) {
  return typeof value === 'string' ? value.replace(urlTokens, token => localUrl(token, oldUrl) ? token.replace(oldUrl, newUrl) : token) : value;
}
function remapFields(before, fields, oldUrl, newUrl) {
  return {...before, ...Object.fromEntries(fields.filter(field => Object.hasOwn(before, field)).map(field => [field, remap(before[field], oldUrl, newUrl)]))};
}
function mapSettingValue(raw, visit) {
  let before;
  try { before = JSON.parse(raw); } catch { return visit(raw); }
  const walk = value => Array.isArray(value) ? value.map(walk) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, settingMediaFields.has(key) ? visit(item) : walk(item)])) : value;
  const next = typeof before === 'string' ? visit(before) : walk(before);
  return JSON.stringify(next) === JSON.stringify(before) ? raw : JSON.stringify(next);
}
async function countReferences(db, url) {
  let total = 0;
  for (const [table, fields] of sources) {
    const [rows] = await db.query(`SELECT ${fields.join(',')} FROM ${table} WHERE ${matches(fields)}`, fields.map(() => url));
    for (const row of rows) {
      if (payloadTables.includes(table)) {
        const payload = parsePayload(row[fields[0]]);
        total += Number(documentFields.some(field => references(payload?.[field], url)));
      } else if (table === 'site_settings') {
        let found = false;
        mapSettingValue(row.setting_value, value => { found ||= references(value, url); return value; });
        total += Number(found);
      } else total += Number(fields.some(field => references(row[field], url)));
    }
  }
  return total;
}
function remapPayload(raw, oldUrl, newUrl) {
  const before = parsePayload(raw);
  if (!before || typeof before !== 'object' || Array.isArray(before)) return before;
  const next = remapFields(before, documentFields, oldUrl, newUrl);
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
  const workflowVersions = new Map(workflows.map(w => [w.draft_id, w.draft_version]));
  const [rows] = await c.query(`SELECT * FROM posts WHERE ${matches(['content', 'cover_image'])} ORDER BY id FOR UPDATE`, [oldUrl, oldUrl]);
  const posts = rows.filter(post => { const next=remapFields(post,documentFields,oldUrl,newUrl);return next.content!==post.content || next.cover_image!==post.cover_image; });
  for (const post of posts) {
    await revisions.baseline(c, post, actorId);
    const next = remapFields(post, documentFields, oldUrl, newUrl);
    await c.query('UPDATE posts SET content=?,cover_image=?,version=version+1,updated_at=NOW() WHERE id=?', [next.content, next.cover_image, post.id]);
    await revisions.record(c, {post_id:post.id}, next, post.status === 'published' ? 'publish' : 'manual', actorId, post.status === 'published' ? post.version + 1 : null);
  }
  for (const draft of drafts) {
    const next = remapPayload(draft.payload, oldUrl, newUrl);
    const changed = JSON.stringify(next) !== JSON.stringify(typeof draft.payload === 'string' ? JSON.parse(draft.payload) : draft.payload);
    const post = posts.find(p => Number(p.id) === Number(draft.post_id));
    const base = post && draft.base_version === post.version ? post.version + 1 : draft.base_version;
    const published = changed && draft.published_version === draft.version ? draft.version + 1 : draft.published_version;
    if (!changed && base === draft.base_version) continue;
    await c.query('UPDATE article_drafts SET payload=?,base_version=?,version=version+?,published_version=? WHERE id=?', [JSON.stringify(next), base, Number(changed), published, draft.id]);
    const workflow = workflows.find(w => w.draft_id === draft.id);
    if (workflow && changed && workflow.draft_version === draft.version) workflow.draft_version++;
  }
  for (const workflow of workflows) {
    const next = remapPayload(workflow.snapshot, oldUrl, newUrl);
    if (JSON.stringify(next) === JSON.stringify(parsePayload(workflow.snapshot)) && workflow.draft_version === workflowVersions.get(workflow.draft_id)) continue;
    await c.query('UPDATE article_workflows SET snapshot=?,draft_version=? WHERE draft_id=?', [JSON.stringify(next), workflow.draft_version, workflow.draft_id]);
  }
  // Preserve history timestamps and publication identity; only remap this asset.
  const [history] = await c.query(`SELECT id,payload FROM article_revisions WHERE ${matches(['payload'])} ORDER BY id FOR UPDATE`, [oldUrl]);
  for (const row of history) {
    const next = remapPayload(row.payload, oldUrl, newUrl);
    if (JSON.stringify(next) === JSON.stringify(parsePayload(row.payload))) continue;
    await c.query('UPDATE article_revisions SET payload=?,content_hash=? WHERE id=?', [JSON.stringify(next), revisions.hash(next), row.id]);
  }
  for (const [table, fields] of sources.filter(([table]) => ['site_settings','updates','projects','site_now','article_series'].includes(table))) {
    const key = table==='site_settings' ? 'setting_key' : 'id';
    const [items] = await c.query(`SELECT ${key},${fields.join(',')} FROM ${table} WHERE ${matches(fields)} ORDER BY ${key} FOR UPDATE`, fields.map(() => oldUrl));
    for (const item of items) {
      const next=table==='site_settings' ? {...item,setting_value:mapSettingValue(item.setting_value,value=>remap(value,oldUrl,newUrl))} : remapFields(item,fields,oldUrl,newUrl);
      if (fields.some(field => next[field]!==item[field])) await c.query(`UPDATE ${table} SET ${fields.map(field => `${field}=?`).join(',')} WHERE ${key}=?`, [...fields.map(field => next[field]), item[key]]);
    }
  }
}
module.exports = { countReferences, updateReferences, remapPayload };
