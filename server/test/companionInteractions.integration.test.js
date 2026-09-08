const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
test('MySQL migration, concurrent events, duplicate requests, reconnection and midnight retain exact global counts',
  { skip: process.env.COMPANION_INTEGRATION !== 'true' }, async t => {
    const mysql = require('mysql2/promise');
    const options = { host: '127.0.0.1', port: Number(process.env.DB_PORT || 33079), user: 'root', password: '', database: 'mooncci_companion_qa' };
    const setup = await mysql.createConnection({ ...options, database: undefined });
    try { await setup.query('CREATE DATABASE IF NOT EXISTS mooncci_companion_qa CHARACTER SET utf8mb4'); }
    finally { await setup.end(); }
    const pool = mysql.createPool({ ...options, connectionLimit: 8 });
    const ids = [];
    t.after(async () => {
      try { if (ids.length) await pool.query('DELETE FROM weather_companion_interactions WHERE id IN (?)', [ids]); }
      finally { await pool.end(); }
    });
    const migration = fs.readFileSync(path.join(__dirname, '../database/migrations/202609080001_create_companion_interactions.sql'), 'utf8');
    await pool.query(migration); await pool.query(migration);
    const { createInteractionRepository } = require('../src/repositories/companionInteractionRepository');
    t.after(() => require('../src/db').end());
    let now = new Date('2026-09-08T15:59:59Z');
    const repo = createInteractionRepository(pool, () => now);
    const before = await repo.readToday();
    const id = randomUUID(); ids.push(id);
    await Promise.all(Array.from({ length: 12 }, () => repo.record({ id, kind: 'pet' })));
    await Promise.all(Array.from({ length: 20 }, () => {
      const eventId = randomUUID(); ids.push(eventId);
      return repo.record({ id: eventId, kind: 'hit' });
    }));
    const after = await repo.readToday();
    assert.equal(after.pets, before.pets + 1); assert.equal(after.hits, before.hits + 20);
    const connection = await mysql.createConnection(options);
    try { assert.deepEqual(await createInteractionRepository(connection, () => now).readToday(), after); }
    finally { await connection.end(); }
    now = new Date('2026-09-08T16:00:00Z');
    const nextDay = await repo.readToday(); assert.equal(nextDay.date, '2026-09-09');
    await repo.record({ id, kind: 'pet' });
    assert.deepEqual(await repo.readToday(), nextDay);
    now = new Date('2026-09-08T15:59:59Z');
    assert.deepEqual(await repo.readToday(), after);
  });
