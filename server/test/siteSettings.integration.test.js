const test = require('node:test');
const assert = require('node:assert/strict');

test('current site settings preserve legacy content, support separate saves and enforce authorization', { skip: process.env.SITE_SETTINGS_INTEGRATION !== 'true' }, async () => {
  assert.match(process.env.DB_NAME || '', /^mooncci_qa(?:_|$)/);
  process.env.CSRF_TRUSTED_ORIGINS = 'https://qa.mooncci.invalid';
  process.env.SITE_URL = 'https://qa.mooncci.invalid';
  const db = require('../src/db'), platform = require('../src/platformDb');
  const jwt = require('jsonwebtoken'), app = require('../src/index');
  const [original] = await db.query("SELECT * FROM site_settings WHERE setting_key IN ('brand','profile','hero','footer')");
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const token = id => `mooncci_token=${jwt.sign({ id }, process.env.JWT_SECRET)}`;
  const request = (method, data, headers = {}) => fetch(base + '/settings/site', { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', Origin: 'https://qa.mooncci.invalid', Cookie: token(1), ...headers }, body: data ? JSON.stringify(data) : undefined });
  const store = (key, value) => db.query('INSERT INTO site_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)', [key, JSON.stringify(value)]);
  let member, admin;
  try {
    const [memberRow] = await db.query("INSERT INTO users (username,email,password_hash,role,status) VALUES ('Settings QA member',?,'test-only','user','active')", [`settings-member-${Date.now()}@example.invalid`]); member = memberRow.insertId;
    const [adminRow] = await db.query("INSERT INTO users (username,email,password_hash,role,status) VALUES ('Settings QA admin',?,'test-only','admin','active')", [`settings-admin-${Date.now()}@example.invalid`]); admin = adminRow.insertId;
    assert.equal((await request('PUT', { brand: { site_title: 'blocked' } }, { Cookie: '' })).status, 401);
    assert.equal((await request('PUT', { brand: { site_title: 'blocked' } }, { Cookie: token(member) })).status, 403);
    assert.equal((await request('PUT', { hero: { title: 'blocked' } }, { 'X-Requested-With': '' })).status, 403);
    assert.equal((await request('PUT', { hero: { title: 'blocked' } }, { Origin: 'https://untrusted.invalid' })).status, 403);
    const profile = { name: 'legacy', bio: 'Preserve unused saved data', github_url: 'https://example.com' };
    await store('profile', profile);
    await store('hero', { badge: 'old badge', title_before: '探索', title_highlight: '编程', title_after: '之美' });
    await store('footer', { copyright: 'Copyright Mooncci', icp_text: '', police_text: '', police_icon_url: '' });
    let site = await (await request('GET')).json();
    assert.equal(site.hero.title, '探索编程之美'); assert.equal(site.hero.eyebrow, 'mooncci / 个人技术手记');
    assert.equal(site.footer.copyright, '© 2024–2026 mooncci in LNTU'); assert.equal(site.footer.police_icon_url, '/beian.png');
    assert.equal((await request('PUT', { hero: { title: 'mooncci 的技术手记', eyebrow: 'Mooncci / notes', subtitle: '独立保存', secondary_text: '' } }, { Cookie: token(admin) })).status, 200);
    assert.equal((await request('PUT', { brand: { site_title: 'Mooncci · notes', nav_title: 'MOONCCI', logo_url: '/api/uploads/example.png', favicon_url: '/api/uploads/example.ico' } })).status, 200);
    assert.equal((await request('PUT', { footer: { copyright: '© Mooncci', icp_text: '', police_text: '', police_icon_url: '/beian.png' } })).status, 200);
    site = await (await request('GET')).json();
    assert.equal(site.hero.title, 'mooncci 的技术手记'); assert.equal(site.hero.eyebrow, 'mooncci / notes'); assert.equal(site.hero.title_before, site.hero.title); assert.equal(site.hero.title_highlight, ''); assert.equal(site.hero.secondary_text, '');
    assert.equal(site.brand.nav_title, 'mooncci'); assert.equal(site.brand.site_title, 'mooncci · notes'); assert.equal(site.brand.favicon_url, '/api/uploads/example.ico');
    assert.equal(site.footer.icp_text, ''); assert.equal(site.footer.police_text, ''); assert.equal(site.footer.copyright, '© mooncci');
    const [[savedProfile]] = await db.query("SELECT setting_value FROM site_settings WHERE setting_key='profile'"); assert.deepEqual(JSON.parse(savedProfile.setting_value), profile);
    assert.equal((await request('PUT', { hero: { title: ' ' } })).status, 400);
    await request('PUT', { hero: { title_before: '旧客户端标题', title_highlight: '', title_after: '' } });
    site = await (await request('GET')).json(); assert.equal(site.hero.title, '旧客户端标题');
  } finally {
    await db.query("DELETE FROM site_settings WHERE setting_key IN ('brand','profile','hero','footer')");
    for (const row of original) await db.query('INSERT INTO site_settings SET ?', row);
    for (const id of [member, admin].filter(Boolean)) await db.query('DELETE FROM users WHERE id=?', [id]);
    await new Promise(resolve => server.close(resolve)); await db.end(); await platform.end();
  }
});
