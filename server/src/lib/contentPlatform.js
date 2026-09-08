const crypto = require('crypto');

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
function str(value, max, required = false) {
  if (typeof value !== 'string') {
    if (value == null && !required) return '';
    throw fail('文本格式不正确');
  }
  const text = value.trim();
  if ((required && !text) || text.length > max) throw fail(`内容不能为空或超过 ${max} 字符`);
  return text;
}
function webUrl(value, image = false) {
  const text = str(value, 500);
  if (!text) return '';
  if (image && /^\/api\/uploads\/[a-zA-Z0-9._/-]+$/.test(text) && !text.includes('..')) return text;
  try {
    const url = new URL(text);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch {}
  throw fail('地址必须是 HTTPS 地址，图片也可使用本站媒体库地址');
}
function repoName(value) {
  const text = str(value, 200);
  if (text && !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]{1,100}$/.test(text))
    throw fail('仓库格式应为 owner/repository');
  return text;
}
function updateInput(body) {
  if (!['draft', 'published'].includes(body.status)) throw fail('状态不正确');
  return {
    content: str(body.content, 10000, true),
    image_url: webUrl(body.image_url, true),
    status: body.status,
  };
}
function projectInput(body) {
  const slug = str(body.slug, 160, true);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw fail('slug 仅支持小写字母、数字和连字符');
  if (
    !['draft', 'published'].includes(body.status) ||
    !['building', 'active', 'maintenance', 'archived'].includes(body.stage)
  )
    throw fail('作品状态不正确');
  let rank = body.featured_rank;
  if (rank === '' || rank == null) rank = null;
  else if (!Number.isInteger(Number(rank)) || Number(rank) < 0 || Number(rank) > 9999)
    throw fail('推荐顺序应为 0–9999');
  return {
    slug,
    name: str(body.name, 160, true),
    summary: str(body.summary, 2000, true),
    content: str(body.content, 50000),
    cover_image: webUrl(body.cover_image, true),
    tech_stack: str(body.tech_stack, 1000),
    stage: body.stage,
    status: body.status,
    demo_url: webUrl(body.demo_url),
    repo: repoName(body.repo),
    featured_rank: rank == null ? null : Number(rank),
  };
}
function pagination(query = {}) {
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1));
  const pageSize = Math.max(1, Math.min(50, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}
function token() {
  return crypto.randomBytes(32).toString('hex');
}
function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function emailAddress(value) {
  const email = str(value, 254, true).toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw fail('请输入有效邮箱');
  return email;
}
function sqlDate(value) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}
function previousWeek(now = new Date()) {
  const shanghai = new Date(now.getTime() + 8 * 3600000);
  const day = (shanghai.getUTCDay() + 6) % 7;
  const monday = Date.UTC(
    shanghai.getUTCFullYear(),
    shanghai.getUTCMonth(),
    shanghai.getUTCDate() - day,
  );
  return {
    key: new Date(monday - 7 * 86400000).toISOString().slice(0, 10),
    start: sqlDate(monday - 7 * 86400000 - 8 * 3600000),
    end: sqlDate(monday - 8 * 3600000),
    due: now.getTime() >= monday + 3600000,
  };
}
function xml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(
      /[<>&"']/g,
      (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c],
    );
}
function plain(value) {
  return String(value || '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/[#*`>]/g, '')
    .slice(0, 500);
}
function releaseRecords(releases, historical) {
  return releases
    .filter(
      (r) =>
        !r.draft &&
        !r.prerelease &&
        r.published_at &&
        Number.isSafeInteger(r.id) &&
        /^https:\/\/github\.com\//.test(r.html_url || ''),
    )
    .map((r) => ({
      github_id: r.id,
      title: String(r.name || r.tag_name).slice(0, 255),
      content: String(r.body || '').slice(0, 100000),
      url: r.html_url,
      published_at: sqlDate(r.published_at),
      historical: historical ? 1 : 0,
    }));
}
function definiteMailFailure(error) {
  return (
    ['EAUTH', 'EENVELOPE', 'EDNS', 'ECONNECTION'].includes(error?.code) ||
    (Number(error?.responseCode) >= 400 && Number(error?.responseCode) < 600)
  );
}
module.exports = {
  asyncRoute,
  fail,
  str,
  webUrl,
  repoName,
  updateInput,
  projectInput,
  pagination,
  token,
  hash,
  emailAddress,
  sqlDate,
  previousWeek,
  xml,
  plain,
  releaseRecords,
  definiteMailFailure,
};
