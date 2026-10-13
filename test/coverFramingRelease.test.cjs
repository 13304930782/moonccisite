const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {spawnSync} = require('node:child_process');
const verifier = require('../scripts/verify-cover-framing-release.cjs');
const backup = require('../scripts/backup-cover-framing.cjs');

const BACKEND = ['src/lib/articleCoverCrop.js', 'src/lib/articleConflict.js', 'src/lib/articlePublishing.js',
  'src/lib/articleRevisions.js', 'src/routes/articleDrafts.js', 'src/routes/bookmarks.js',
  'src/routes/posts.js', 'src/routes/series.js', 'src/routes/upload.js'];
const PREREQUISITES = ['src/index.js', 'src/lib/publicDocument.js', 'src/services/articleWorkflow.js',
  'src/services/articleSummary.js', 'src/worker.js', 'src/jobs/contentScheduler.js', 'package.json',
  'package-lock.json', 'ecosystem.config.cjs'];
const MIGRATION = '202610130001_article_cover_crop.sql';
const TABLES = ['posts', 'article_drafts', 'article_revisions', 'article_workflows', 'schema_migrations'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';

function temporaryDirectory(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'mooncci-cover-release-test-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(root)), parent);
    assert.ok(path.basename(root).startsWith('mooncci-cover-release-test-'));
    fs.rmSync(root, {recursive: true, force: true});
  });
  return root;
}
function write(root, name, bytes) {
  assert.ok(verifier.safeName(name), 'test fixture path must be scoped');
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, bytes);
}
function filesUnder(root, prefix = '') {
  return fs.readdirSync(root, {withFileTypes: true}).flatMap(entry => entry.isDirectory()
    ? filesUnder(path.join(root, entry.name), prefix + entry.name + '/') : [prefix + entry.name]);
}
function seal(root) {
  const files = [...filesUnder(root).filter(name => !['FILELIST', 'SHA256SUMS'].includes(name)),
    'FILELIST', 'SHA256SUMS'].sort();
  write(root, 'FILELIST', files.join('\n') + '\n');
  write(root, 'SHA256SUMS', files.filter(name => name !== 'SHA256SUMS')
    .map(name => hash(fs.readFileSync(path.join(root, name))) + '  ' + name + '\n').join(''));
}
function baselineFixture() {
  const digest = hash('isolated baseline bytes');
  const config = (name, megabytes) => ({max_memory_restart: megabytes * 1024 * 1024,
    node_args: ['--max-old-space-size=256'], exec_interpreter: '/usr/bin/node',
    pm_exec_path: '/www/wwwroot/mooncci-source/server/src/' + (name === 'api' ? 'index' : 'worker') + '.js',
    pm_cwd: '/www/wwwroot/mooncci-source/server'});
  return {version: 1, captured_at: new Date().toISOString(),
    backend: Object.fromEntries(BACKEND.map(name => [name, name.endsWith('articleCoverCrop.js') ? null : digest])),
    prerequisites: Object.fromEntries(PREREQUISITES.map(name => [name, digest])),
    main: {index: digest, runtime_document: digest, runtime_styles: digest, runtime_home_css: digest},
    reader: {index: digest, node: '/usr/bin/node'},
    pm2: {'mooncci-api': config('api', 450), 'mooncci-worker': config('worker', 300)},
    verify_articles: [{id: 17, cover: true}, {id: 18, cover: false}],
    original_covers: [{id: 17, file: 'uploads/unchanged-cover.png', sha256: digest}]};
}
function packageFixture(t, target = 'main') {
  const temporary = temporaryDirectory(t), root = path.join(temporary, 'package');
  fs.mkdirSync(root);
  const main = target === 'main';
  write(root, 'BASELINE.json', json(baselineFixture()));
  write(root, 'MANIFEST.json', json({version: 1, release: 'cover-framing', target, revision: 'a'.repeat(40),
    backend_files: main ? BACKEND : [], migrations: main ? [MIGRATION] : [],
    migration_runner: main ? 'scripts/migrate-article-cover-crop.js' : null,
    restarts: main ? ['mooncci-api', 'mooncci-worker'] : [], dependency_install: false,
    configuration_changes: false, isolated_renderer_lock: main ? hash('locked renderer') : null}));
  write(root, 'BACKEND_FILES', main ? BACKEND.join('\n') + '\n' : '');
  write(root, 'deploy.sh', '#!/bin/bash\ntrue\n');
  write(root, 'rollback.sh', '#!/bin/bash\ntrue\n');
  write(root, 'verify.cjs', '// Isolated package fixture; never execute deployment.\n');
  write(root, 'dist/index.html', '<!doctype html><link href="/assets/site.css?v=1#theme"><script src="/assets/app.js"></script>\n');
  write(root, 'dist/assets/site.css', 'body { color: black; }\n');
  write(root, 'dist/assets/app.js', 'console.log("isolated frontend");\n');
  if (main) {
    write(root, 'backup.cjs', '// Isolated package backup fixture.\n');
    for (const name of BACKEND) write(root, 'server/' + name, '// Isolated backend fixture: ' + name + '\n');
    write(root, 'server/database/migrations/' + MIGRATION, 'ALTER TABLE posts ADD COLUMN cover_crop JSON NULL AFTER cover_image;\n');
    write(root, 'server/scripts/migrate-article-cover-crop.js', '// Isolated migration fixture.\n');
    write(root, 'server/runtime/document.mjs', 'export const renderDocument = () => ({html: "fixture"});\n');
    write(root, 'server/runtime/styles.json', json({article: {css: ['/assets/article.css'], js: ['/assets/article.js']}}));
    write(root, 'server/runtime/home.css', '.hero { background: url("/assets/hero.svg?theme=1"); }\n');
    write(root, 'server/runtime/node_modules/jsdom/package.json', json({name: 'jsdom', version: '26.1.0'}));
    write(root, 'dist/assets/article.css', '.article { margin: 0; }\n');
    write(root, 'dist/assets/article.js', 'export const article = true;\n');
    write(root, 'dist/assets/hero.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  }
  seal(root);
  return {root, temporary};
}
function updateJSON(root, name, change) {
  const value = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
  change(value); write(root, name, json(value)); seal(root);
}

test('isolated main and reader packages satisfy their exact scopes and the verifier CLI', async t => {
  for (const target of ['main', 'reader']) await t.test(target, t => {
    const {root} = packageFixture(t, target);
    const result = verifier.verifyPackage(root);
    assert.equal(result.manifest.target, target);
    assert.deepEqual(result.manifest.restarts, target === 'main' ? ['mooncci-api', 'mooncci-worker'] : []);
    assert.equal(result.files.some(name => name.startsWith('server/')), target === 'main');
    const cli = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/verify-cover-framing-release.cjs'),
      'package', root], {encoding: 'utf8', timeout: 10000});
    assert.ifError(cli.error); assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /PASS: cover-framing package/);
  });
});

test('package checks reject changed bytes and unlisted files before deployment', t => {
  const {root} = packageFixture(t);
  fs.appendFileSync(path.join(root, 'dist/assets/app.js'), 'tampered\n');
  assert.throws(() => verifier.verifyPackage(root), /Package bytes changed/);
  seal(root); verifier.verifyPackage(root);
  write(root, 'unlisted.txt', 'unlisted\n');
  assert.throws(() => verifier.verifyPackage(root), /Extracted files differ/);
});

test('re-signing cannot authorize unknown files, credentials, native modules or unprefixed backend paths', async t => {
  for (const name of ['server/src/routes/unreviewed.js', 'dist/.env', 'server/runtime/native.node',
    'src/lib/articlePublishing.js']) await t.test(name, t => {
    const {root} = packageFixture(t); write(root, name, 'out of release scope\n'); seal(root);
    assert.throws(() => verifier.verifyPackage(root), /Forbidden package scope/);
  });
  await t.test('reader cannot carry backend files', t => {
    const {root} = packageFixture(t, 'reader');
    write(root, 'server/src/lib/articleCoverCrop.js', 'backend\n'); seal(root);
    assert.throws(() => verifier.verifyPackage(root), /Forbidden package scope/);
  });
});

test('required release controls, backend, migration and runtime cannot disappear from a re-signed package', async t => {
  for (const [target, name] of [['reader', 'deploy.sh'], ['reader', 'rollback.sh'], ['main', 'verify.cjs'],
    ['main', 'backup.cjs'], ['main', 'server/src/routes/posts.js'], ['main', 'server/scripts/migrate-article-cover-crop.js'],
    ['main', 'server/database/migrations/' + MIGRATION], ['main', 'server/runtime/document.mjs'],
    ['main', 'server/runtime/node_modules/jsdom/package.json']]) await t.test(name, t => {
    const {root} = packageFixture(t, target); fs.unlinkSync(path.join(root, name)); seal(root);
    assert.throws(() => verifier.verifyPackage(root), /Missing required package file/);
  });
});

test('HTML, runtime styles and home CSS must reference included assets even after re-signing', async t => {
  for (const name of ['dist/assets/app.js', 'dist/assets/site.css', 'dist/assets/article.js',
    'dist/assets/article.css', 'dist/assets/hero.svg']) await t.test(name, t => {
    const {root} = packageFixture(t); fs.unlinkSync(path.join(root, name)); seal(root);
    assert.throws(() => verifier.verifyPackage(root), /Missing scoped file/);
  });
});

test('checksums require one valid entry per file and cannot list themselves or escape the package', async t => {
  const mutations = {
    missing: lines => lines.slice(1), duplicate: lines => [...lines, lines[0]],
    incorrect: lines => [lines[0].replace(/^[a-f0-9]{64}/, '0'.repeat(64)), ...lines.slice(1)],
    malformed: lines => ['not-a-hash  BASELINE.json', ...lines.slice(1)],
    self: lines => [...lines, '0'.repeat(64) + '  SHA256SUMS'],
    traversal: lines => [...lines, '0'.repeat(64) + '  ../outside.txt'],
  };
  for (const [name, mutate] of Object.entries(mutations)) await t.test(name, t => {
    const {root} = packageFixture(t);
    const lines = fs.readFileSync(path.join(root, 'SHA256SUMS'), 'utf8').trimEnd().split('\n');
    write(root, 'SHA256SUMS', mutate(lines).join('\n') + '\n');
    assert.throws(() => verifier.verifyPackage(root), /checksum|Package bytes changed/i);
  });
});

test('LF metadata and scripts remain mandatory with matching checksums', async t => {
  for (const name of ['FILELIST', 'SHA256SUMS', 'MANIFEST.json', 'BASELINE.json', 'BACKEND_FILES',
    'deploy.sh', 'rollback.sh', 'server/database/migrations/' + MIGRATION]) await t.test(name, t => {
    const {root} = packageFixture(t);
    write(root, name, fs.readFileSync(path.join(root, name), 'utf8').replace(/\n/g, '\r\n'));
    if (!['FILELIST', 'SHA256SUMS'].includes(name)) seal(root);
    assert.throws(() => verifier.verifyPackage(root), /Non-LF/);
  });
  await t.test('checksum final newline is required', t => {
    const {root} = packageFixture(t);
    write(root, 'SHA256SUMS', fs.readFileSync(path.join(root, 'SHA256SUMS'), 'utf8').trimEnd());
    assert.throws(() => verifier.verifyPackage(root), /Non-LF/);
  });
});

test('scoped path reads and asset references reject traversal and nonregular paths', t => {
  const {root, temporary} = packageFixture(t);
  write(temporary, 'outside.txt', 'outside must remain unread\n');
  for (const name of ['../outside.txt', '/outside.txt', 'dist/../../outside.txt', 'dist//index.html',
    './dist/index.html', 'dist\\..\\outside.txt', 'C:/outside.txt']) {
    assert.equal(verifier.safeName(name), false);
    assert.throws(() => verifier.plainFile(root, name, true), /Unsafe scoped path/);
    assert.throws(() => verifier.digest(root, name), /Unsafe scoped path/);
  }
  assert.throws(() => verifier.plainFile(root, 'dist'), /Nonregular scoped path/);
  assert.equal(verifier.plainFile(root, 'dist/not-found.js', true), null);
  write(root, 'dist/index.html', '<script src="/assets/../../outside.txt"></script>\n'); seal(root);
  assert.throws(() => verifier.verifyPackage(root), /Unsafe scoped path/);
  assert.equal(fs.readFileSync(path.join(temporary, 'outside.txt'), 'utf8'), 'outside must remain unread\n');
});

test('re-signed manifests cannot enable dependency/config changes, change restarts or redirect migrations', async t => {
  const mutations = {
    dependencies: manifest => { manifest.dependency_install = true; },
    configuration: manifest => { manifest.configuration_changes = true; },
    restart: manifest => { manifest.restarts = ['mooncci-api']; },
    migration: manifest => { manifest.migration_runner = 'scripts/migrate.js'; },
  };
  for (const [name, mutate] of Object.entries(mutations)) await t.test(name, t => {
    const {root} = packageFixture(t); updateJSON(root, 'MANIFEST.json', mutate);
    assert.throws(() => verifier.verifyPackage(root), /Unexpected deployment scope/);
  });
  await t.test('original cover paths stay within uploads', t => {
    const {root} = packageFixture(t);
    updateJSON(root, 'BASELINE.json', value => { value.original_covers[0].file = 'uploads/../../outside.txt'; });
    assert.throws(() => verifier.verifyPackage(root), /Invalid original cover hash/);
  });
});

function dumpFixture() {
  const rows = {posts: ["(1,'literal ),( remains one row')", "(2,'escaped \\' quote and (parenthesis)')"],
    article_drafts: [], article_revisions: ["(1,'doubled '' quote')"],
    article_workflows: ["(1,0xAABB)"], schema_migrations: ["(1,'checksum-a')", "(2,'checksum-b')"]};
  return '-- MySQL dump 10.13\n' + TABLES.map(table => '-- Table structure for table `' + table + '`\n' +
    'CREATE TABLE `' + table + '` (`id` int, `body` text) ENGINE=InnoDB;\n' +
    '-- Dumping data for table `' + table + '`\n' + rows[table].map(row =>
      'INSERT INTO `' + table + '` VALUES ' + row + ';\n').join('')).join('') +
    '-- Dump completed on 2026-10-14 00:01:02\n';
}
function recordedBackup(t, sql = dumpFixture()) {
  const root = temporaryDirectory(t), file = path.join(root, 'database-before.sql');
  fs.writeFileSync(file, sql);
  const metadata = backup.inspectDump(file);
  write(root, 'database-backup.json', json(metadata));
  write(root, 'database-before.sql.sha256', metadata.sha256 + '  database-before.sql\n');
  return {root, file, metadata};
}

test('dump validation counts single-row INSERTs, preserves quoted punctuation and verifies exact backup bytes', t => {
  const {root, file, metadata} = recordedBackup(t);
  assert.deepEqual(metadata.tables, TABLES);
  assert.deepEqual(metadata.counts, {posts: 2, article_drafts: 0, article_revisions: 1, article_workflows: 1, schema_migrations: 2});
  assert.equal(metadata.sha256, hash(fs.readFileSync(file)));
  assert.equal(metadata.bytes, fs.statSync(file).size);
  assert.equal(metadata.format, 'mysqldump-single-transaction-hex-blob-single-row');
  assert.equal(metadata.completion_marker, '-- Dump completed on 2026-10-14 00:01:02');
  assert.deepEqual(backup.verifyBackup(root), metadata);
});

test('dump validation rejects incomplete, missing, database-bound, extended or corrupt SQL', async t => {
  const mutations = {
    incomplete: sql => sql.replace(/-- Dump completed on[^\n]*\n$/, ''),
    schema: sql => sql.replace('CREATE TABLE `posts`', 'CREATE TABLE `unexpected_posts`'),
    data: sql => sql.replace('-- Dumping data for table `article_drafts`', '-- missing draft data section'),
    use: sql => 'USE `production`;\n' + sql,
    database: sql => 'CREATE DATABASE `production`;\n' + sql,
    extended: sql => sql.replace(/INSERT INTO `posts` VALUES [^\n]*;/, "INSERT INTO `posts` VALUES (1,'first'),(2,'second');"),
    columnInsert: sql => sql.replace('INSERT INTO `posts` VALUES', 'INSERT INTO `posts` (`id`,`body`) VALUES'),
    truncatedInsert: sql => sql.replace(/INSERT INTO `posts` VALUES [^\n]*;/, "INSERT INTO `posts` VALUES (1,'unfinished';"),
    invalidUTF8: sql => Buffer.concat([Buffer.from([0xff]), Buffer.from(sql)]),
  };
  for (const [name, mutate] of Object.entries(mutations)) await t.test(name, t => {
    const root = temporaryDirectory(t), file = path.join(root, 'invalid.sql');
    fs.writeFileSync(file, mutate(dumpFixture()));
    assert.throws(() => backup.inspectDump(file), /dump|Dump|UTF-8/i);
  });
});

test('backup verification rejects changed SQL, row-count metadata and malformed checksum sidecars', async t => {
  const mutations = {
    bytes: ({file}) => fs.appendFileSync(file, '-- extra bytes\n'),
    counts: ({root, metadata}) => write(root, 'database-backup.json', json({...metadata, counts: {...metadata.counts, posts: 1}})),
    checksum: ({root}) => write(root, 'database-before.sql.sha256', '0'.repeat(64) + '  database-before.sql\n'),
    CRLF: ({root, metadata}) => write(root, 'database-before.sql.sha256', metadata.sha256 + '  database-before.sql\r\n'),
    newline: ({root, metadata}) => write(root, 'database-before.sql.sha256', metadata.sha256 + '  database-before.sql'),
    filename: ({root, metadata}) => write(root, 'database-before.sql.sha256', metadata.sha256 + '  ../database-before.sql\n'),
  };
  for (const [name, mutate] of Object.entries(mutations)) await t.test(name, t => {
    const fixture = recordedBackup(t); mutate(fixture);
    assert.throws(() => backup.verifyBackup(fixture.root), /backup|Dump/i);
  });
});

test('backup creation requests one InnoDB transaction, single-row SQL and private temporary credentials', async t => {
  const temporary = temporaryDirectory(t), liveFiles = path.join(temporary, 'live'), output = path.join(temporary, 'backup');
  fs.mkdirSync(liveFiles); fs.mkdirSync(output);
  const live = '/www/wwwroot/mooncci-source/server', folder = '/www/backup/mooncci-cover-framing-main.Test123';
  const env = {DB_HOST: '127.0.0.1', DB_PORT: '33079', DB_USER: 'isolated_user',
    DB_PASSWORD: 'fixture "quote"\\slash\nline', DB_NAME: 'mooncci_qa_fixture'};
  write(liveFiles, '.env', 'DB_NAME=mooncci_qa_fixture\n');
  const physical = file => {
    for (const [virtual, local] of [[live, liveFiles], [folder, output]]) {
      if (file === virtual) return local;
      if (file.startsWith(virtual + '/')) return path.join(local, ...file.slice(virtual.length + 1).split('/'));
    }
    throw Error('Test must not access real deployment paths: ' + file);
  };
  const virtualFS = {...fs,
    realpathSync: file => { physical(file); return file; },
    existsSync: file => file === '/usr/bin/mysqldump' || file !== '/www/server/mysql/bin/mysqldump' && file !== '/usr/bin/mariadb-dump' && fs.existsSync(physical(file)),
  };
  for (const name of ['readFileSync', 'writeFileSync', 'openSync', 'unlinkSync'])
    virtualFS[name] = (file, ...args) => fs[name](physical(file), ...args);
  const calls = [], messages = [], module = {exports: {}}, taskProcess = {argv: ['node', 'backup.cjs', 'create', live, folder], exitCode: 0};
  let connected;
  const mockedRequire = name => {
    if (name === 'node:fs') return virtualFS;
    if (name === 'node:path') return path.posix;
    if (name.endsWith('/dotenv')) return {parse: bytes => { assert.match(bytes.toString(), /DB_NAME=mooncci_qa_fixture/); return env; }};
    if (name.endsWith('/mysql2/promise')) return {createConnection: async config => {
      connected = config;
      return {query: async (sql, args) => {
        assert.match(sql, /information_schema\.TABLES/); assert.deepEqual(Array.from(args[1]), TABLES);
        return [TABLES.map(TABLE_NAME => ({TABLE_NAME, ENGINE: 'InnoDB'}))];
      }, end: async () => {}};
    }};
    if (name === 'node:child_process') return {spawnSync: (command, args, options) => {
      assert.equal(command, '/usr/bin/mysqldump');
      if (args.includes('--version')) return {status: 0};
      if (args.includes('--help')) return {status: 0, stdout: 'set-gtid-purged no-tablespaces'};
      calls.push(Array.from(args));
      const defaults = fs.readFileSync(physical(args[0].slice('--defaults-file='.length)), 'utf8');
      assert.match(defaults, /^\[client\]\n/); assert.match(defaults, /password="fixture \\"quote\\"\\\\slash\\nline"/);
      assert.ok(args.every(argument => !argument.includes('fixture ') && !argument.includes(env.DB_USER)));
      fs.writeSync(options.stdio[1], dumpFixture()); return {status: 0};
    }};
    return require(name);
  };
  mockedRequire.main = module;
  const source = fs.readFileSync(path.resolve(__dirname, '../scripts/backup-cover-framing.cjs'), 'utf8');
  await vm.runInNewContext(source, {require: mockedRequire, module, process: taskProcess, Buffer,
    console: {log: message => messages.push(message), error: message => messages.push(message)}});
  assert.equal(taskProcess.exitCode, 0, messages.join('\n'));
  assert.equal(connected.database, env.DB_NAME); assert.equal(connected.password, env.DB_PASSWORD);
  assert.equal(calls.length, 1);
  for (const option of ['--single-transaction', '--quick', '--hex-blob', '--skip-extended-insert', '--skip-add-locks',
    '--skip-lock-tables', '--default-character-set=utf8mb4', '--set-gtid-purged=OFF', '--no-tablespaces'])
    assert.ok(calls[0].includes(option), 'missing recoverable dump option: ' + option);
  assert.deepEqual(calls[0].slice(-6), [env.DB_NAME, ...TABLES]);
  assert.equal(fs.readdirSync(output).some(name => name.startsWith('.mysql-defaults-')), false);
  assert.deepEqual(backup.verifyBackup(output).counts,
    {posts: 2, article_drafts: 0, article_revisions: 1, article_workflows: 1, schema_migrations: 2});
});

test('local HTTPS acceptance preserves production SNI and supports both Node lookup callback shapes', async t => {
  for (const all of [false, true]) await t.test('lookup all=' + all, async () => {
    const module = {exports: {}}, resource = '/assets/framed-cover.js?v=fixture';
    let timeout;
    const mockedRequire = name => name === 'node:https' ? {get: (options, onResponse) => {
      assert.equal(options.hostname, 'mooncci.site');
      assert.equal(options.servername, 'mooncci.site');
      assert.equal(options.family, 4);
      assert.equal(options.port, 443);
      assert.equal(options.path, resource);
      let lookup;
      options.lookup(options.hostname, {all, family: 4}, (...args) => { lookup = args; });
      assert.deepEqual(JSON.parse(JSON.stringify(lookup)), all
        ? [null, [{address: '127.0.0.1', family: 4}]] : [null, '127.0.0.1', 4]);
      const request = new EventEmitter();
      request.setTimeout = milliseconds => { timeout = milliseconds; return request; };
      request.destroy = error => request.emit('error', error);
      queueMicrotask(() => {
        const response = new EventEmitter(); response.statusCode = 200;
        onResponse(response);
        response.emit('data', Buffer.from('first '));
        response.emit('data', Buffer.from('second'));
        response.emit('end');
      });
      return request;
    }} : require(name);
    const source = fs.readFileSync(path.resolve(__dirname, '../scripts/verify-cover-framing-release.cjs'), 'utf8');
    // Export only inside this isolated VM; the deployment helper's API is unchanged.
    vm.runInNewContext(source + '\nmodule.exports.requestDocument = requestDocument;\n',
      {require: mockedRequire, module, Buffer});
    assert.equal((await module.exports.requestDocument(resource)).toString(), 'first second');
    assert.equal(timeout, 20000);
  });
});
