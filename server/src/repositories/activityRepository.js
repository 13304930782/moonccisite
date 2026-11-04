const {publicRelease}=require('../lib/publicContent');
const db = require('../platformDb');
const {articlePath}=require('../lib/articleSlug');
const { pagination, plain } = require('../lib/contentPlatform');

// Legacy post writes used mysql2's local timezone conversion; normalize without rewriting stored posts.
const configuredOffset = Number(
  process.env.POSTS_STORAGE_UTC_OFFSET_MINUTES ?? -new Date().getTimezoneOffset(),
);
const postOffset =
  Number.isInteger(configuredOffset) && Math.abs(configuredOffset) <= 840 ? configuredOffset : 0;
const union = `SELECT CONCAT('post-',id) AS activity_id, id, 'post' AS type, title, summary AS excerpt, TIMESTAMPADD(MINUTE,${-postOffset},published_at) AS published_at, CONCAT('/article/',id) AS path, 0 AS historical, 0 AS prerelease, slug FROM posts WHERE status='published'
UNION ALL SELECT CONCAT('update-',id), id, 'update', LEFT(content,100), content, published_at, CONCAT('/updates/',id), 0, 0, NULL FROM updates WHERE status='published'
UNION ALL SELECT CONCAT('release-',r.id), r.id, 'release', CONCAT(p.name, ' · ',r.title), r.content,r.published_at,CONCAT('/projects/',p.slug,'?release=',r.id,'#release-',r.id),r.historical,r.prerelease,NULL FROM project_releases r JOIN projects p ON p.id=r.project_id AND p.repo=r.repo WHERE ${publicRelease('r')}`;
async function activity(query = {}, period = null) {
  const { page, pageSize, offset } = pagination(query);
  const where = ['published_at IS NOT NULL'];
  const params = [];
  if (['post', 'update', 'release'].includes(query.type)) {
    where.push('type=?');
    params.push(query.type);
  }
  if (query.scope === 'home') where.push("type IN ('update','release')");
  if (period) {
    where.push('published_at >= ? AND published_at < ? AND historical=0');
    params.push(period.start, period.end);
  }
  const base = `FROM (${union}) a WHERE ${where.join(' AND ')}`;
  const [[count]] = await db.query(`SELECT COUNT(*) AS total ${base}`, params);
  const [items] = await db.query(
    `SELECT * ${base} ORDER BY published_at DESC, activity_id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );
  const localized = query.locale==='en' ? await Promise.all(items.map(async item=>{
    if(item.type==='post'){
      const row=await require('../lib/articleTranslations').publicPost(db,{...item,summary:item.excerpt},'en',{strict:false});
      return {...item,title:row.title,excerpt:row.summary,path:(row.content_locale==='en'?'/en':'')+articlePath(item),content_locale:row.content_locale,available_locales:row.available_locales};
    }
    if(item.type==='update'){
      const row=await require('../lib/contentTranslations').localize(db,'update',{id:item.id,content:item.excerpt},'en');
      return {...item,title:row.content.slice(0,100),excerpt:row.content,path:(row.content_locale==='en'?'/en':'')+item.path,content_locale:row.content_locale,available_locales:row.available_locales};
    }
    return {...item,content_locale:'zh-CN',available_locales:['zh-CN']};
  })) : items;
  return {
    items: localized.map((i) => ({ ...i, path: i.type === 'post' && query.locale!=='en' ? articlePath(i) : i.path, excerpt: plain(i.excerpt), title: plain(i.title) })),
    total: Number(count.total),
    page,
    pageSize,
  };
}
async function allActivity(period) {
  const items = [];
  let page = 1;
  let data;
  do {
    data = await activity({ page, pageSize: 50 }, period);
    items.push(...data.items);
    page++;
  } while (items.length < data.total);
  return items;
}
module.exports = { activity, allActivity };
