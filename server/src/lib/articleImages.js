// Only enrich local upload references. Never fetch URLs or expose the media list.
const LOCAL_IMAGE = /(?:^|[\s(<"'])\/api\/uploads\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,254})(?=$|[\s)?#>"'])/g;
async function articleImageDimensions(post, db) {
  const names = new Set();
  for (const text of [post.cover_image, post.content]) {
    for (const match of String(text || '').matchAll(LOCAL_IMAGE)) {
      names.add(match[1]);
      if (names.size >= 200) break;
    }
    if (names.size >= 200) break;
  }
  if (!names.size) return {};
  const [rows] = await db.query(
    `SELECT filename, width, height FROM media_assets WHERE status='active' AND filename IN (${[...names].map(() => '?').join(',')})`, [...names]);
  const dimensions = {};
  for (const row of rows) {
    const width = Number(row.width), height = Number(row.height);
    if (names.has(row.filename) && Number.isInteger(width) && width > 0 && width <= 100000 &&
        Number.isInteger(height) && height > 0 && height <= 100000) {
      dimensions[`/api/uploads/${row.filename}`] = { width, height };
    }
  }
  return dimensions;
}
module.exports = { articleImageDimensions };
