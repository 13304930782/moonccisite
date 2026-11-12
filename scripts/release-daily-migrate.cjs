'use strict';
// Only these migrations are allowed. MySQL DDL is not transactionally reversible.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { createRequire } = require('node:module');
const live = '/www/wwwroot/mooncci-source/server';
const req = createRequire(path.join(live, 'package.json'));
req('dotenv').config({ path: path.join(live, '.env') });
const mysql = req('mysql2/promise');
const names = ['202611120002_post_aside.sql', '202611120003_daily_questions.sql'];
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

async function main() {
  const root = path.resolve(process.argv[2]);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'MANIFEST.json'), 'utf8'));
  const items = names.map(name => {
    const filename = path.join(root, 'migrations', name);
    const bytes = fs.readFileSync(filename);
    if (digest(bytes) !== manifest.migrations[name]) throw Error('Migration package checksum mismatch: ' + name);
    const sql = bytes.toString('utf8').trim();
    return { name, sql, checksum: digest(sql) };
  });
  const db = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, charset: 'utf8mb4', multipleStatements: true });
  let locked = false;
  try {
    const [[lock]] = await db.query("SELECT GET_LOCK('mooncci_schema_migrations', 30) AS locked");
    if (lock.locked !== 1) throw Error('Migration lock unavailable');
    locked = true;
    const [rows] = await db.query('SELECT filename, checksum FROM schema_migrations WHERE filename IN (?, ?)', names);
    const done = new Map(rows.map(row => [row.filename, row.checksum]));
    for (const item of items) if (done.has(item.name) && done.get(item.name) !== item.checksum) throw Error('Recorded migration checksum differs: ' + item.name);
    if (!done.has(names[1])) {
      const [tables] = await db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('daily_questions','daily_answers')");
      if (tables.length) throw Error('Daily question tables exist without migration record; inspect before retry');
    }
    if (!done.has(names[0])) {
      const [[col]] = await db.query("SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='posts' AND COLUMN_NAME='aside'");
      if (!col) await db.query(items[0].sql);
      const [[actual]] = await db.query("SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='posts' AND COLUMN_NAME='aside'");
      if (!actual || actual.COLUMN_TYPE.toLowerCase() !== 'varchar(40)' || actual.IS_NULLABLE !== 'YES' || actual.COLUMN_DEFAULT !== null) throw Error('Unexpected posts.aside definition');
      await db.query('INSERT INTO schema_migrations (filename,checksum) VALUES (?,?)', [items[0].name, items[0].checksum]);
      console.log('Applied ' + items[0].name);
    }
    if (!done.has(names[1])) {
      await db.query(items[1].sql);
      await db.query('INSERT INTO schema_migrations (filename,checksum) VALUES (?,?)', [items[1].name, items[1].checksum]);
      console.log('Applied ' + items[1].name);
    }
    const [[aside]] = await db.query("SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='posts' AND COLUMN_NAME='aside'");
    if (!aside || aside.COLUMN_TYPE.toLowerCase() !== 'varchar(40)' || aside.IS_NULLABLE !== 'YES' || aside.COLUMN_DEFAULT !== null) throw Error('Unexpected posts.aside definition');
    const [columns] = await db.query("SELECT TABLE_NAME AS tbl,COLUMN_NAME AS col,COLUMN_TYPE AS typ,IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('daily_questions','daily_answers')");
    const map = new Map(columns.map(c => [`${c.tbl}.${c.col}`, c]));
    const required = {
      'daily_questions.id': 'bigint', 'daily_questions.question_date': 'date', 'daily_questions.text': 'varchar(40)', 'daily_questions.choices': 'json',
      'daily_questions.status': 'enum(', 'daily_questions.summary': 'text', 'daily_questions.summary_status': 'enum(', 'daily_questions.created_at': 'timestamp', 'daily_questions.updated_at': 'timestamp',
      'daily_answers.id': 'bigint', 'daily_answers.question_id': 'bigint', 'daily_answers.choice_index': 'tinyint', 'daily_answers.text': 'varchar(80)', 'daily_answers.dedupe_key': 'varchar(80)', 'daily_answers.created_at': 'timestamp',
    };
    for (const [key, type] of Object.entries(required)) {
      const col = map.get(key);
      if (!col || !col.typ.toLowerCase().startsWith(type)) throw Error('Unexpected daily question column: ' + key);
    }
    const [indexes] = await db.query("SELECT TABLE_NAME AS tbl, INDEX_NAME AS idx, NON_UNIQUE AS non_unique, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('daily_questions','daily_answers') GROUP BY TABLE_NAME,INDEX_NAME,NON_UNIQUE");
    const unique = (table, cols) => indexes.some(index => index.tbl === table && Number(index.non_unique) === 0 && index.cols === cols);
    if (!unique('daily_questions', 'question_date') || !unique('daily_answers', 'question_id,dedupe_key')) throw Error('Required daily question unique index missing');
    console.log('Whitelisted migrations verified');
  } finally {
    if (locked) await db.query("SELECT RELEASE_LOCK('mooncci_schema_migrations')");
    await db.end();
  }
}
main().catch(error => { console.error('Migration stopped:', error.message); process.exitCode = 1; });
