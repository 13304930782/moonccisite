const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
test('two consecutive double clicks count one hit, isolated clicks/doubles do not, and strokes reset the sequence', async () => {
  const { createCompanionGesture, reactionEmotion } = await import(
    '../../src/app/lib/companionInteraction.ts'
  );
  const gesture = createCompanionGesture();
  assert.deepEqual(
    [0, 100, 220, 320].map((t) => gesture.tap(t)),
    ['single', 'double', 'single', 'hit'],
  );
  assert.deepEqual(
    [500, 600, 700, 800].map((t) => gesture.tap(t)),
    ['single', 'double', 'single', 'hit'],
  );
  gesture.reset();
  assert.deepEqual(
    [0, 100, 1900, 2000].map((t) => gesture.tap(t)),
    ['single', 'double', 'single', 'double'],
  );
  gesture.reset();
  assert.deepEqual(
    [0, 600, 1200, 1800].map((t) => gesture.tap(t)),
    ['single', 'single', 'single', 'single'],
  );
  gesture.reset();
  gesture.tap(0);
  gesture.tap(100);
  gesture.reset();
  assert.equal(gesture.tap(200), 'single');
  assert.equal(gesture.tap(300), 'double');
  assert.equal(reactionEmotion('hit', '14'), '21');
  assert.equal(reactionEmotion('pet', '14'), '10');
  assert.equal(reactionEmotion(null, '14'), '14');
});
function memoryPool() {
  const events = new Map();
  return {
    events,
    async query(sql, params) {
      if (sql.startsWith('INSERT')) {
        if (events.has(params[0]))
          throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
        events.set(params[0], { date: params[1], kind: params[2] });
        return [{}];
      }
      if (sql.startsWith('SELECT kind'))
        return [[events.get(params[0])].filter(Boolean)];
      if (sql.startsWith('SELECT COALESCE')) {
        const rows = [...events.values()].filter((x) => x.date === params[0]);
        return [
          [
            {
              pets: rows.filter((x) => x.kind === 'pet').length,
              hits: rows.filter((x) => x.kind === 'hit').length,
            },
          ],
        ];
      }
      throw Error('unexpected SQL');
    },
  };
}
test('shared persisted events are idempotent, concurrent gestures accumulate, and Beijing midnight preserves prior history', async (t) => {
  const {
    createInteractionRepository,
  } = require('../src/repositories/companionInteractionRepository');
  const db = require('../src/db');
  t.after(() => db.end());
  const pool = memoryPool();
  let now = new Date('2026-09-08T15:59:59Z');
  const repo = createInteractionRepository(pool, () => now);
  assert.deepEqual(await repo.readToday(), {
    date: '2026-09-08',
    timezone: 'Asia/Shanghai',
    pets: 0,
    hits: 0,
  });
  const id = randomUUID();
  await Promise.all([
    repo.record({ id, kind: 'pet' }),
    repo.record({ id, kind: 'pet' }),
  ]);
  await Promise.all(
    Array.from({ length: 10 }, () =>
      repo.record({ id: randomUUID(), kind: 'hit' }),
    ),
  );
  assert.equal((await repo.readToday()).pets, 1);
  assert.equal((await repo.readToday()).hits, 10);
  assert.equal(
    (await createInteractionRepository(pool, () => now).readToday()).hits,
    10,
  );
  await assert.rejects(repo.record({ id, kind: 'hit' }), { status: 409 });
  now = new Date('2026-09-08T16:00:00Z');
  assert.equal((await repo.readToday()).date, '2026-09-09');
  assert.equal((await repo.readToday()).pets, 0);
  await repo.record({ id, kind: 'pet' }); // Retry across midnight cannot create a new event.
  assert.equal((await repo.readToday()).pets, 0);
  assert.equal(pool.events.size, 11);
});
test('anonymous shared counts accept validated individual gestures, reject supplied totals and dates, and never fabricate success on failure', async (t) => {
  const express = require('express');
  const {
    createInteractionRouter,
  } = require('../src/routes/companionInteractions');
  const received = [];
  let fail = false;
  const app = express();
  app.use(express.json());
  app.use(
    '/interactions',
    createInteractionRouter({
      readToday: async () => ({ date: '2026-09-08', pets: 2, hits: 1 }),
      record: async (event) => {
        received.push(event);
        if (fail) throw Error('database unavailable');
        return { date: '2026-09-08', pets: 3, hits: 1 };
      },
    }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/interactions`;
  const get = await fetch(url);
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('cache-control'), 'no-store');
  const post = (body) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  assert.equal((await post({ kind: 'pet' })).status, 400);
  assert.equal((await post({ id: randomUUID(), kind: 'other' })).status, 400);
  const id = randomUUID();
  assert.equal(
    (await post({ id, kind: 'pet', pets: 1000, date: '2099-01-01' })).status,
    200,
  );
  assert.deepEqual(received[0], { id, kind: 'pet' });
  fail = true;
  assert.equal((await post({ id: randomUUID(), kind: 'hit' })).status, 503);
});

test('relaxed double pairs and pointer releases tolerate touch jitter without duplicate rubs or extra fingers', async () => {
 const {createCompanionGesture, createCompanionPointer} = await import('../../src/app/lib/companionInteraction.ts');
 const g=createCompanionGesture();
 assert.deepEqual([0,420,1200,1620].map(t=>g.tap(t)),['single','double','single','hit']);
 const p=createCompanionPointer();
 assert.equal(p.begin(1,100,100,0),true);
 assert.equal(p.begin(2,100,100,1),false);
 for(let i=0;i<20;i++)assert.equal(p.move(1,100+i%3,100),false);
 assert.equal(p.end(2,100),false);assert.equal(p.end(1,120),true);assert.equal(p.end(1,120),false);
 p.begin(1,100,100,200);assert.equal(p.move(1,130,100),true);assert.equal(p.move(1,160,100),false);assert.equal(p.end(1,400),false);
 p.begin(1,100,100,500);p.cancel(1);assert.equal(p.end(1,600),false);
 p.begin(1,100,100,700);assert.equal(p.end(1,1500),false);
});
