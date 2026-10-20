const { catalog, defaults, validate, evaluate, instant } = require('../lib/festivals');
const { authRequired, adminOnly } = require('../middleware/auth');
const db = require('../db');
const router = require('../lib/asyncRouter')();
async function read() {
  const [[row]] = await db.query('SELECT setting_value FROM site_settings WHERE setting_key=? LIMIT 1', ['festivals']);
  return row ? validate(JSON.parse(row.setting_value), Date.now(), false) : defaults();
}
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.get('/active', async (_req, res) => {
  try {
    const { modules, ...state } = evaluate(await read());
    res.json(state);
  } catch {
    res.json({ active: null, reason: '节日配置暂不可用', serverTime: new Date().toISOString(), nextCheckAt: new Date(Date.now() + 60000).toISOString() });
  }
});
router.use(authRequired, adminOnly);
router.get('/', async (_req, res) => {
  const config = await read(); res.json({ config, catalog, state: evaluate(config) });
});
router.put('/', async (req, res) => {
  const config = validate(req.body);
  await db.query('INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)', ['festivals', JSON.stringify(config)]);
  res.json({ config, catalog, state: evaluate(config) });
});
router.post('/preview', async (req, res) => {
  const body = req.body || {};
  if (Object.keys(body).some(k => !['festivalId', 'at', 'config'].includes(k))) return res.status(400).json({ message: '预览包含无效字段' });
  const at = instant(body.at);
  if (!Number.isFinite(at) || at < Date.parse('2025-01-01T00:00:00+08:00') || at >= Date.parse('2201-01-01T00:00:00+08:00')) return res.status(400).json({ message: '请提供含时区的有效模拟日期（2025–2200）' });
  const config = body.config ? validate(body.config, Date.now(), false) : await read();
  if (body.festivalId) {
    if (!catalog.some(m => m.id === body.festivalId && m.implemented)) return res.status(400).json({ message: '主题尚未实现或不存在' });
    config.mode = 'manual'; config.manual = { id: body.festivalId, expiresAt: new Date(at + 86400000).toISOString() };
  }
  res.json(evaluate(config, at));
});
router.use((error, _req, res, next) => {
  if (error.status === 400) return res.status(400).json({ message: error.message });
  next(error);
});
module.exports = router;
