const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createMediaSync } = require('../src/lib/mediaSync');
const { listPagination } = require('../src/lib/listPagination');

test('10,000 existing media files use 20 batched lookups; concurrent and warm requests do not rescan', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mooncci-capacity-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (let start = 0; start < 10000; start += 100) {
    await Promise.all(Array.from({ length: 100 }, (_, i) => fs.writeFile(path.join(directory, `${start + i}.png`), '')));
  }
  await fs.mkdir(path.join(directory, 'folder.png'));
  let queries = 0;
  const db = { query: async (_sql, names) => { queries++; assert.ok(names.length <= 500); return [names.map(filename => ({ filename }))]; } };
  const sync = createMediaSync({ directory, db, isImage: name => name.endsWith('.png'), importFile: () => { throw Error('existing file must not be read or rewritten'); } });
  const start = performance.now();
  await Promise.all([sync(), sync(), sync()]);
  assert.equal(queries, 20);
  await sync();
  assert.equal(queries, 20);
  t.diagnostic(`10,000 real directory entries, mock DB: ${Math.round(performance.now() - start)} ms, 20 queries; prior per-file algorithm requires 10,000 queries. Not production latency.`);
});

test('failed media reconciliation retries and skips concurrently removed files', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mooncci-sync-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'new.png'), '');
  let fail = true, imported = 0;
  const sync = createMediaSync({ directory, db: { query: async () => { if (fail) throw Error('DB unavailable'); return [[]]; } }, isImage: () => true,
    importFile: async () => { imported++; throw Object.assign(Error('removed'), { code: 'ENOENT' }); } });
  await assert.rejects(sync(), /DB unavailable/);
  fail = false;
  await sync();
  assert.equal(imported, 1);
});

test('pagination bounds malicious, negative and excessive parameters', () => {
  assert.deepEqual(listPagination({ page: '-2', pageSize: '5000000' }), { page: 1, pageSize: 100 });
  assert.deepEqual(listPagination({ page: '1 OR 1=1', pageSize: ['1', '2'] }), { page: 1, pageSize: 50 });
});
