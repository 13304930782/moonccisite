#!/usr/bin/env node
// Pinned, scoped main-origin release. Run as a detached child process, never source.
// Python is deliberately not used. Reader and Nginx configuration are separate releases.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const REVISION = 'f9f9f10ae2513ec431568be2239b38b13435ac26';
const BASE = '332b85f3296e495c3fd8050e6cb79ed9d994f506';
const LIVE = '/www/wwwroot/mooncci-source/server';
const WEB = '/www/wwwroot/mooncci.site';
const NODE = '/opt/mooncci-node-v24.20.0/bin/node';
const FILES = ['src/routes/upload.js', 'src/routes/comments.js', 'src/lib/clientIp.js', 'src/lib/mediaReferences.js', 'src/lib/mediaFileTransaction.js'];
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const normal = data => sha(data.toString('utf8').replace(/\r\n/g, '\n'));
const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
function run(args, options = {}) {
  return cp.execFileSync(args[0], args.slice(1), {stdio: 'inherit', ...options});
}
function output(args, options = {}) {
  return cp.execFileSync(args[0], args.slice(1), {encoding: 'utf8', ...options}).trim();
}
function asUser(command, cwd) {
  return run(['su', '-s', '/bin/bash', 'mooncci', '-c',
    'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; ' + (cwd ? 'cd ' + quote(cwd) + ' && ' : '') + command]);
}
function pm2list() {
  return JSON.parse(output(['su', '-s', '/bin/bash', 'mooncci', '-c',
    'export PATH=/opt/mooncci-node-v24.20.0/bin:$PATH; pm2 jlist']));
}
function apiProcess() {
  const matches = pm2list().filter(p => p.name === 'mooncci-api' &&
    p.pm2_env.pm_exec_path === LIVE + '/src/index.js' && p.pm2_env.pm_cwd === LIVE);
  if (matches.length !== 1 || matches[0].pm2_env.status !== 'online') throw Error('API process/path is not the expected online mooncci-api');
  return matches[0];
}
function walk(directory, prefix = '') {
  const result = [];
  for (const item of fs.readdirSync(directory, {withFileTypes: true})) {
    const name = path.posix.join(prefix, item.name);
    if (item.isSymbolicLink()) throw Error('Symlink in release: ' + name);
    if (item.isDirectory()) result.push(...walk(path.join(directory, item.name), name));
    else if (item.isFile()) result.push(name);
    else throw Error('Unexpected release file: ' + name);
  }
  return result.sort();
}
function assertDestination(file, root) {
  if (!file.startsWith(root + '/')) throw Error('Destination outside release scope');
  let current = file;
  while (true) {
    try { if (fs.lstatSync(current).isSymbolicLink()) throw Error('Symlink destination: ' + current); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (current === '/') break;
    current = path.dirname(current);
  }
}
async function health() {
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch('http://127.0.0.1:3001/api/health', {signal: AbortSignal.timeout(3000)});
      if (r.ok && (await r.json()).ok === true) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw Error('API readiness check failed');
}
async function main() {
  if (process.getuid() !== 0) throw Error('Run as root in a child process');
  if (Number(process.versions.node.split('.')[0]) < 24) throw Error('Node 24+ required; Python is not used');
  fs.accessSync(NODE, fs.constants.X_OK);
  for (const file of [LIVE + '/.env', WEB + '/index.html', LIVE + '/runtime/document.mjs']) fs.accessSync(file);
  for (const program of ['git', 'su', 'flock', 'npm']) output(['which', program]);
  const uid = Number(output(['id', '-u', 'mooncci']));
  const gid = Number(output(['id', '-g', 'mooncci']));
  const api = apiProcess();
  fs.mkdirSync('/www/backup', {recursive: true});
  const backup = fs.mkdtempSync('/www/backup/mooncci-pr101-main-');
  fs.chmodSync(backup, 0o700);
  console.log('BACKUP=' + backup);
  const stage = fs.mkdtempSync('/www/wwwroot/.mooncci-pr101-build-');
  fs.chmodSync(stage, 0o700);
  console.log('BUILD_STAGE=' + stage);
  const git = (...args) => output(['git', '-c', 'safe.directory=' + stage, '-C', stage, ...args]);
  run(['git', 'init', '-q', stage]);
  run(['git', '-C', stage, 'remote', 'add', 'origin', 'https://github.com/13304930782/moonccisite.git']);
  run(['git', '-C', stage, 'fetch', '--depth=3', 'origin', REVISION]);
  run(['git', '-C', stage, 'checkout', '--detach', '-q', 'FETCH_HEAD']);
  if (git('rev-parse', 'HEAD') !== REVISION) throw Error('Unexpected downloaded revision');
  git('merge-base', '--is-ancestor', BASE, REVISION);
  function baseline() {
    const paths = git('ls-tree', '-r', '--name-only', BASE, '--', 'server/src', 'server/package.json', 'server/package-lock.json').split('\n');
    for (const source of paths) {
      const relative = source.slice('server/'.length);
      const dest = path.join(LIVE, relative);
      assertDestination(dest, LIVE);
      const before = cp.execFileSync('git', ['-c', 'safe.directory=' + stage, '-C', stage, 'show', BASE + ':' + source]);
      const next = fs.readFileSync(path.join(stage, source));
      const accepted = FILES.includes(relative) ? [normal(before), normal(next)] : [normal(before)];
      if (!fs.existsSync(dest) || !accepted.includes(normal(fs.readFileSync(dest)))) throw Error('Production source drift: ' + relative + '; stopped before publishing');
    }
    for (const relative of FILES) {
      if (paths.includes('server/' + relative)) continue;
      const dest = path.join(LIVE, relative);
      assertDestination(dest, LIVE);
      if (fs.existsSync(dest) && normal(fs.readFileSync(dest)) !== normal(fs.readFileSync(path.join(stage, 'server', relative)))) throw Error('Production source drift: ' + relative);
    }
  }
  baseline();
  await health();
  // Read schema only; never execute migrations or expose credentials.
  const schemaCode = `const db=require(${JSON.stringify(LIVE + '/src/db')});
    (async()=>{try{
      for(const sql of [
        'SELECT id,content,cover_image,version FROM posts LIMIT 0',
        'SELECT setting_key,setting_value FROM site_settings LIMIT 0',
        'SELECT id,content,image_url FROM updates LIMIT 0',
        'SELECT id,content,cover_image,icon_image FROM projects LIMIT 0',
        'SELECT id,content FROM site_now LIMIT 0',
        'SELECT id,cover_image FROM article_series LIMIT 0',
        'SELECT id,post_id,payload,version,base_version,published_version FROM article_drafts LIMIT 0',
        'SELECT id,payload,content_hash FROM article_revisions LIMIT 0',
        'SELECT draft_id,snapshot,draft_version FROM article_workflows LIMIT 0'
      ]) await db.query(sql);
      require.resolve('jsdom',{paths:[${JSON.stringify(LIVE + '/runtime')}]});
    }finally{await db.end();}})().catch(e=>{console.error('Schema/dependency check failed:',e.code||e.message);process.exitCode=1;});`;
  run([NODE, '-e', schemaCode], {cwd: LIVE});
  run(['chown', '-R', uid + ':' + gid, stage]);
  asUser('npm ci --registry=https://registry.npmjs.org && npm run check && node scripts/test-document.mjs', stage);
  if (git('status', '--porcelain')) throw Error('Source changed during build');
  for (const file of FILES) run([NODE, '--check', path.join(stage, 'server', file)]);
  // Check the built renderer against production renderer dependencies, not build dependencies.
  const smoke = fs.mkdtempSync(path.join(LIVE, '.pr101-render-check-'));
  try {
    fs.cpSync(path.join(stage, 'server/runtime'), smoke, {recursive: true});
    if (fs.existsSync(path.join(LIVE, 'runtime/node_modules'))) fs.symlinkSync(path.join(LIVE, 'runtime/node_modules'), path.join(smoke, 'node_modules'));
    run([NODE, '--input-type=module', '-e', 'await import(process.argv[1])', 'file://' + path.join(smoke, 'document.mjs')]);
  } finally { fs.rmSync(smoke, {recursive: true, force: true}); }
  const rows = [];
  const add = (source, destination, root, kind) => {
    assertDestination(destination, root);
    const data = fs.readFileSync(source);
    const before = fs.existsSync(destination) ? fs.readFileSync(destination) : null;
    if (before && sha(before) === sha(data)) return;
    const saved = path.join(backup, 'before', kind, path.relative(root, destination));
    if (before) {
      fs.mkdirSync(path.dirname(saved), {recursive: true});
      fs.copyFileSync(destination, saved);
    }
    rows.push({source, destination, root, kind, saved, before: before ? sha(before) : null, after: sha(data),
      stat: before ? {uid: fs.statSync(destination).uid, gid: fs.statSync(destination).gid, mode: fs.statSync(destination).mode & 0o777} : null});
  };
  for (const name of walk(path.join(stage, 'dist'))) {
    if (name === 'index.html') continue;
    if (name.split('/').some(part => part.startsWith('.'))) throw Error('Hidden frontend file');
    add(path.join(stage, 'dist', name), path.join(WEB, name), WEB, 'frontend');
  }
  for (const name of FILES) add(path.join(stage, 'server', name), path.join(LIVE, name), LIVE, 'backend');
  for (const name of walk(path.join(stage, 'server/runtime'))) {
    if (!['document.mjs', 'styles.json', 'home.css'].includes(name) && !name.startsWith('chunks/') && !name.startsWith('assets/')) throw Error('Unexpected managed renderer file: ' + name);
    add(path.join(stage, 'server/runtime', name), path.join(LIVE, 'runtime', name), LIVE, 'renderer');
  }
  add(path.join(stage, 'dist/index.html'), WEB + '/index.html', WEB, 'entry');
  fs.writeFileSync(path.join(backup, 'MANIFEST.json'), JSON.stringify({revision: REVISION, base: BASE, python: false,
    migrations: [], dependencies: [], restart: ['mooncci-api'], nginx: false, reader: false, files: rows}, null, 2) + '\n');
  baseline();
  if (apiProcess().pm_id !== api.pm_id) throw Error('API process changed during build');
  for (const row of rows) {
    const current = fs.existsSync(row.destination) ? sha(fs.readFileSync(row.destination)) : null;
    if (current !== row.before) throw Error('Live file changed during preparation: ' + row.destination);
  }
  const changed = [];
  let stopped = false;
  const install = row => {
    assertDestination(row.destination, row.root);
    const temporary = row.destination + '.pr101-new';
    if (fs.existsSync(temporary)) throw Error('Stale temporary destination: ' + temporary);
    fs.mkdirSync(path.dirname(row.destination), {recursive: true});
    fs.writeFileSync(temporary, fs.readFileSync(row.source), {flag: 'wx', mode: 0o644});
    try {
      fs.chmodSync(temporary, 0o644); fs.chownSync(temporary, uid, gid);
      fs.renameSync(temporary, row.destination); changed.push(row);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    if (sha(fs.readFileSync(row.destination)) !== row.after) throw Error('Installed checksum mismatch');
  };
  try {
    for (const row of rows.filter(row => row.kind === 'frontend')) install(row);
    stopped = true;
    asUser('pm2 stop ' + api.pm_id);
    for (const row of rows.filter(row => ['backend', 'renderer'].includes(row.kind))) install(row);
    asUser('pm2 restart ' + api.pm_id);
    await health();
    for (const url of ['/', '/article/18']) {
      const r = await fetch('http://127.0.0.1:3001' + url, {headers: {Host: 'mooncci.site'}, signal: AbortSignal.timeout(10000)});
      const html = await r.text();
      if (!r.ok || !html.includes('mooncci-document-data')) throw Error('SSR probe failed: ' + url);
    }
    for (const row of rows.filter(row => row.kind === 'entry')) install(row);
    for (const row of rows) if (sha(fs.readFileSync(row.destination)) !== row.after) throw Error('Final checksum mismatch');
  } catch (error) {
    console.error('Deployment failed; restoring scoped files:', error.message);
    try {
      if (stopped) asUser('pm2 stop ' + api.pm_id);
      for (const row of [...changed].reverse()) {
        const current = fs.existsSync(row.destination) ? sha(fs.readFileSync(row.destination)) : null;
        if (current !== row.after && current !== row.before) throw Error('Rollback refused later modification: ' + row.destination);
        if (current === row.before) continue;
        if (row.before === null) fs.unlinkSync(row.destination);
        else {
          fs.copyFileSync(row.saved, row.destination);
          fs.chownSync(row.destination, row.stat.uid, row.stat.gid); fs.chmodSync(row.destination, row.stat.mode);
        }
      }
      if (stopped) { asUser('pm2 restart ' + api.pm_id); await health(); }
      console.error('ROLLBACK=PASS');
    } catch (rollbackError) { console.error('ROLLBACK NEEDS ATTENTION:', rollbackError.message); }
    throw error;
  }
  console.log('PASS: main frontend, matching SSR, and PR101 scoped backend published.');
  console.log('REVISION=' + REVISION + '\nBACKUP=' + backup + '\nEXIT_CODE=0');
}
const lock = '/www/backup/mooncci-deploy.lock';
if (process.argv.includes('--lock-held')) main().catch(error => { console.error('STOPPED:', error.message, '\nEXIT_CODE=1'); process.exitCode = 1; });
else {
  fs.mkdirSync('/www/backup', {recursive: true});
  const result = cp.spawnSync('flock', ['-w', '120', lock, NODE, __filename, '--lock-held'], {stdio: 'inherit', env: {...process.env, PATH: '/opt/mooncci-node-v24.20.0/bin:' + process.env.PATH}});
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
