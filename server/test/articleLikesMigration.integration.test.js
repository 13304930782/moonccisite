const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { migrate, migrationSpec } = require('../scripts/migrate-article-likes');

test('article likes migration handles retries, recovery and checksum conflicts on isolated MySQL', { skip: process.env.ARTICLE_LIKES_MIGRATION_TEST !== 'true' }, async () => {
  // Fixed loopback port and a unique test database prevent using a configured production DB.
  const connection = await mysql.createConnection({ host: '127.0.0.1', port: Number(process.env.TEST_DB_PORT || 33079), user: 'root', password: '' });
  const db = 'likes_migration_test_' + crypto.randomBytes(6).toString('hex');
  try {
    await connection.query(`CREATE DATABASE \`${db}\``);
    await connection.query(`USE \`${db}\``);
    await connection.query('CREATE TABLE users (id INT PRIMARY KEY) ENGINE=InnoDB');
    await connection.query('CREATE TABLE posts (id INT PRIMARY KEY) ENGINE=InnoDB');
    await connection.query('CREATE TABLE schema_migrations (filename VARCHAR(255) PRIMARY KEY, checksum VARCHAR(64) NOT NULL)');
    assert.equal((await migrate(connection, 'check')).previous, 'pending');
    assert.equal((await migrate(connection, 'apply')).previous, 'pending');
    assert.equal((await migrate(connection, 'apply')).previous, 'complete');
    assert.equal((await migrate(connection, 'verify')).state, 'complete');
    await connection.query('DELETE FROM schema_migrations WHERE filename=?', [migrationSpec().filename]);
    assert.equal((await migrate(connection, 'apply')).previous, 'recoverable');
    await connection.query('UPDATE schema_migrations SET checksum=? WHERE filename=?', ['0'.repeat(64), migrationSpec().filename]);
    await assert.rejects(migrate(connection, 'apply'), /checksum mismatch/);
    await connection.query('UPDATE schema_migrations SET checksum=? WHERE filename=?', [migrationSpec().checksum, migrationSpec().filename]);
    await connection.query('ALTER TABLE article_likes DROP FOREIGN KEY fk_article_likes_post, DROP INDEX ix_article_likes_post');
    await assert.rejects(migrate(connection, 'verify'), /indexes/);
  } finally {
    await connection.query(`DROP DATABASE IF EXISTS \`${db}\``);
    await connection.end();
  }
});
