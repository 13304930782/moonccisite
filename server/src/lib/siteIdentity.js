function brandText(value = '') {
  return String(value).replace(/\bmooncci\b/gi, 'mooncci');
}
function siteOrigin() {
  const value = process.env.SITE_URL || 'https://mooncci.site';
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Invalid SITE_URL');
  return url.origin;
}
module.exports = { brandText, siteOrigin };
