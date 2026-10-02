const express = require('express');
const { randomBytes } = require('node:crypto');
const { ipKeyGenerator } = require('express-rate-limit');
const { validateEmail, mobileconfig } = require('../lib/mailClient');

function privateResponse(req, res, next) {
  res.set({ 'Cache-Control': 'private, no-store, max-age=0', 'Pragma': 'no-cache', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
  // Runs before the global JSON parser: reject unsupported methods and bodies
  // on read-only requests without parsing or logging their contents.
  if (!['POST', 'GET', 'HEAD', 'OPTIONS'].includes(req.method)) return res.status(405).set('Allow', 'POST, GET, HEAD, OPTIONS').end();
  if (req.method !== 'POST' && (req.headers['transfer-encoding'] || Number(req.headers['content-length']) > 0)) return res.status(400).json({ message: '此请求不接受正文。' });
  if (req.method === 'POST' && !req.is('text/plain')) return res.status(415).json({ message: '请使用纯文本邮箱地址。' });
  next();
}
function createRouter({ now = Date.now, ttl = 120000, capacity = 128, perSourceCapacity = 4 } = {}) {
  const router = express.Router(), tickets = new Map();
  const prune = () => { for (const [key, item] of tickets) if (item.expires <= now()) tickets.delete(key); };
  const timer = setInterval(prune, 30000); timer.unref();
  router.close = () => { clearInterval(timer); tickets.clear(); };
  router.use(privateResponse);
  // The existing /api CSRF middleware still runs before this router. A text body
  // avoids JSON parser diagnostics ever containing the submitted address.
  router.post('/profile', express.text({ type: 'text/plain', limit: 512 }), (req, res) => {
    if (Object.keys(req.query).length || !req.is('text/plain')) return res.status(400).json({ message: '请求格式不正确。' });
    const email = validateEmail(req.body);
    if (!email) return res.status(400).json({ message: '请输入有效的 @mooncci.site 完整邮箱地址。' });
    prune();
    // Derive the source from Express's existing trusted proxy policy; group IPv6
    // addresses by subnet. A bounded ticket pool also bounds quota bookkeeping.
    const source = ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown');
    const owned = [...tickets.values()].filter(item => item.source === source);
    if (owned.length >= perSourceCapacity) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((Math.min(...owned.map(item => item.expires)) - now()) / 1000))));
      return res.status(429).json({ message: '生成次数过多，请稍后重试；已有下载链接仍可使用。' });
    }
    if (tickets.size >= capacity) return res.status(503).json({ message: '下载服务繁忙，请稍后重试。' });
    const token = randomBytes(32).toString('hex');
    tickets.set(token, { source, email, expires: now() + ttl });
    res.status(201).json({ download: `/api/mail-setup/profile/${token}.mobileconfig` });
  });
  router.head('/profile/:file', (_req, res) => res.sendStatus(405));
  router.get('/profile/:file', (req, res) => {
    prune();
    const match = /^([a-f0-9]{64})\.mobileconfig$/.exec(req.params.file);
    const item = match && tickets.get(match[1]);
    if (!item || Object.keys(req.query).length) return res.status(404).send('下载已过期，请返回设置页重新生成。');
    // Reusable during the short TTL: Safari/system download retries must work.
    res.set({ 'Content-Type': 'application/x-apple-aspen-config', 'Content-Disposition': 'attachment; filename="mooncci-mail.mobileconfig"' });
    res.send(mobileconfig(item.email));
  });
  router.use((_req, res) => res.sendStatus(404));
  router.use((_error, _req, res, _next) => res.status(400).json({ message: '请求内容格式或大小不合法。' }));
  return router;
}
module.exports = { createRouter, privateResponse };
