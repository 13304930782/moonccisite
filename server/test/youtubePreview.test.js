const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createRouter } = require('../src/routes/youtubePreview');

async function serve(t, options) {
  const app = express();
  app.use('/preview', createRouter(options));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return id => fetch(`http://127.0.0.1:${server.address().port}/preview/${id}`);
}

test('YouTube metadata uses a fixed origin, ignores upstream HTML and caches successes', async t => {
  let calls = 0, clock = 0;
  const get = await serve(t, { now: () => clock, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&format=json');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ title: ' Video title ', author_name: ' Channel ', html: '<script>bad</script>', thumbnail_url: 'https://evil.test/' });
  } });
  assert.equal((await get('invalid')).status, 400);
  assert.equal(calls, 0);
  assert.deepEqual(await (await get('dQw4w9WgXcQ')).json(), { title: 'Video title', author: 'Channel', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' });
  await get('dQw4w9WgXcQ'); assert.equal(calls, 1);
  clock = 3600001;
  await get('dQw4w9WgXcQ'); assert.equal(calls, 2);
});

test('concurrent requests deduplicate and failed lookups retry after one minute', async t => {
  let calls = 0, clock = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const get = await serve(t, { now: () => clock, fetchImpl: async () => { calls++; await gate; throw new Error('timeout'); } });
  const first = get('dQw4w9WgXcQ'), second = get('dQw4w9WgXcQ');
  await new Promise(resolve => setTimeout(resolve, 30));
  release();
  assert.deepEqual((await Promise.all([first, second])).map(r => r.status), [503, 503]);
  assert.equal(calls, 1);
  await get('dQw4w9WgXcQ'); assert.equal(calls, 1);
  clock = 60001;
  await get('dQw4w9WgXcQ'); assert.equal(calls, 2);
});

test('malformed and oversized upstream metadata fail closed', async t => {
  const get = await serve(t, { fetchImpl: async url => url.includes('dQw4w9WgXcQ') ? new Response('x'.repeat(16385)) : Response.json({ title: 123 }) });
  assert.equal((await get('dQw4w9WgXcQ')).status, 503);
  assert.equal((await get('abcdefghijk')).status, 503);
});

test('metadata endpoint limits repeated requests without extra upstream calls', async t => {
  let calls = 0;
  const get = await serve(t, { fetchImpl: async () => { calls++; return Response.json({ title: 'Video' }); } });
  for (let i = 0; i < 30; i++) assert.equal((await get('dQw4w9WgXcQ')).status, 200);
  assert.equal((await get('dQw4w9WgXcQ')).status, 429);
  assert.equal(calls, 1);
});
