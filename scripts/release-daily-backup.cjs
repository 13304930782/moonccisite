'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const live = '/www/wwwroot/mooncci-source/server';
const req = createRequire(path.join(live, 'package.json'));
req('dotenv').config({ path: path.join(live, '.env') });
const dest = process.argv[2];
if (!dest || !process.env.DB_NAME || !process.env.DB_USER) throw Error('Database backup configuration missing');
const fd = fs.openSync(dest, 'wx', 0o600);
try {
  const result = spawnSync('mysqldump', ['--single-transaction', '--quick', '--routines', '--triggers', '--host', process.env.DB_HOST || '127.0.0.1', '--port', process.env.DB_PORT || '3306', '--user', process.env.DB_USER, '--', process.env.DB_NAME], { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || '' }, stdio: ['ignore', fd, 'pipe'] });
  if (result.error || result.status !== 0 || fs.fstatSync(fd).size < 100) throw Error('Database backup failed');
  fs.fsyncSync(fd);
  console.log('Database backup created');
} finally { fs.closeSync(fd); }
