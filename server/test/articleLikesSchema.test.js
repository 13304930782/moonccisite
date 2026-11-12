const test = require('node:test');
const assert = require('node:assert/strict');
const { assertTable } = require('../scripts/migrate-article-likes');

function connectionWithTypes(types) {
  const columns = ['user_id', 'post_id', 'created_at'].map((Field, index) => ({ Field, Type: types[index], Null: 'NO' }));
  return { async query(sql) {
    if (sql.includes('information_schema.TABLES')) return [[{ ENGINE: 'InnoDB' }]];
    if (sql.startsWith('SHOW COLUMNS')) return [columns];
    if (sql.startsWith('SHOW INDEX')) return [[
      { Key_name: 'PRIMARY', Seq_in_index: 1, Column_name: 'user_id' },
      { Key_name: 'PRIMARY', Seq_in_index: 2, Column_name: 'post_id' },
      { Key_name: 'ix_article_likes_post', Seq_in_index: 1, Column_name: 'post_id' },
    ]];
    if (sql.includes('information_schema.KEY_COLUMN_USAGE')) return [[
      { COLUMN_NAME: 'user_id', REFERENCED_TABLE_NAME: 'users', REFERENCED_COLUMN_NAME: 'id', DELETE_RULE: 'CASCADE' },
      { COLUMN_NAME: 'post_id', REFERENCED_TABLE_NAME: 'posts', REFERENCED_COLUMN_NAME: 'id', DELETE_RULE: 'CASCADE' },
    ]];
    throw new Error(`Unexpected query: ${sql}`);
  } };
}

test('article likes migration accepts MySQL integer variants and exact datetime precision', async () => {
  await assertTable(connectionWithTypes(['int', 'int(11)', 'datetime(3)']));
  await assertTable(connectionWithTypes(['INT(11)', 'INT', 'DATETIME(3)']));
  for (const types of [['int(12)', 'int', 'datetime(3)'], ['int', 'int', 'datetimeX3'], ['int', 'int', 'datetime(6)']]) {
    await assert.rejects(assertTable(connectionWithTypes(types)), /Unexpected article_likes columns/);
  }
});
