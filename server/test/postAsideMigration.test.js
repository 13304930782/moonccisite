const test = require('node:test');
const assert = require('node:assert/strict');
const { applyPostAside } = require('../scripts/migrate-post-aside');

test('aside migration adds a missing column and safely accepts a prior successful DDL', async () => {
  let column, writes = 0;
  const connection = { query: async sql => {
    if (sql.startsWith('SELECT')) return [[column].filter(Boolean)];
    writes++; column = { COLUMN_TYPE: 'varchar(40)', IS_NULLABLE: 'YES', COLUMN_DEFAULT: null }; return [{}];
  } };
  await applyPostAside(connection, 'ALTER TABLE posts ADD COLUMN aside VARCHAR(40)');
  await applyPostAside(connection, 'ALTER TABLE posts ADD COLUMN aside VARCHAR(40)');
  assert.equal(writes, 1);
  column.COLUMN_TYPE = 'varchar(20)';
  await assert.rejects(applyPostAside(connection, 'ALTER'), /unexpected definition/);
  assert.equal(writes, 1);
});
