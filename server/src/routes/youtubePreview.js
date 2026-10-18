const rateLimit = require('express-rate-limit');

function createRouter({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const router = require('../lib/asyncRouter')();
  const cache = new Map(), pending = new Map();
  router.use(rateLimit({ windowMs: 60000, limit: 30, standardHeaders: true, legacyHeaders: false }));

  async function load(id) {
    let data = null;
    try {
      const url = new URL('https://www.youtube.com/oembed');
      url.searchParams.set('url', `https://www.youtube.com/watch?v=${id}`);
      url.searchParams.set('format', 'json');
      const response = await fetchImpl(url.href, { redirect: 'error', signal: AbortSignal.timeout(4000), headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('unavailable');
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 16384) throw new Error('response too large');
          chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel().catch(() => {}); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (typeof body.title !== 'string' || !body.title.trim()) throw new Error('missing title');
      data = {
        title: body.title.trim().slice(0, 300),
        author: typeof body.author_name === 'string' ? body.author_name.trim().slice(0, 200) : '',
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
    } catch { /* Unavailable videos remain usable as ordinary links. */ }
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(id, { data, expires: now() + (data ? 3600000 : 60000) });
    return data;
  }

  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    if (!/^[\w-]{11}$/.test(id)) return res.status(400).json({ message: '视频地址无效' });
    const hit = cache.get(id);
    let data;
    if (hit && hit.expires > now()) data = hit.data;
    else {
      if (!pending.has(id)) {
        if (pending.size >= 200) return res.status(503).json({ message: '视频信息暂不可用' });
        pending.set(id, load(id).finally(() => pending.delete(id)));
      }
      data = await pending.get(id);
    }
    if (!data) return res.status(503).json({ message: '视频信息暂不可用' });
    res.json(data);
  });
  return router;
}

module.exports = createRouter();
module.exports.createRouter = createRouter;
