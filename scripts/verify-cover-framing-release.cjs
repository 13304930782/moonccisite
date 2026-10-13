// Package, drift, rollback and read-only acceptance checks for this release only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const {pathToFileURL} = require('node:url');
const BACKEND = ['src/lib/articleCoverCrop.js', 'src/lib/articleConflict.js', 'src/lib/articlePublishing.js',
  'src/lib/articleRevisions.js', 'src/routes/articleDrafts.js', 'src/routes/bookmarks.js',
  'src/routes/posts.js', 'src/routes/series.js', 'src/routes/upload.js'];
const PREREQUISITES = ['src/index.js', 'src/lib/publicDocument.js', 'src/services/articleWorkflow.js',
  'src/services/articleSummary.js', 'src/worker.js', 'src/jobs/contentScheduler.js', 'package.json', 'package-lock.json', 'ecosystem.config.cjs'];
const MIGRATION = '202610130001_article_cover_crop.sql';
const CONFIG = ['max_memory_restart', 'node_args', 'exec_interpreter', 'pm_exec_path', 'pm_cwd'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {mode: 0o600});
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const safeName = name => typeof name === 'string' && /^[A-Za-z0-9_@+.,/-]+$/.test(name) && !name.startsWith('/') && name.split('/').every(part => !['', '.', '..'].includes(part));
function sameKeys(value, keys) { if (!equal(Object.keys(value).sort(), [...keys].sort())) throw Error('Unexpected object scope'); }
function plainFile(root, name, missing = false) {
  if (!safeName(name)) throw Error('Unsafe scoped path: ' + name);
  let file = root;
  const parts = name.split('/');
  for (let i = 0; i < parts.length; i++) {
    file = path.join(file, parts[i]);
    if (!fs.existsSync(file)) {
      // existsSync follows symlinks; a dangling symlink must still be rejected.
      try { if (fs.lstatSync(file).isSymbolicLink()) throw Error('Dangling symlink: ' + name); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (missing) return null;
      throw Error('Missing scoped file: ' + name);
    }
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || (i === parts.length - 1 ? !stat.isFile() : !stat.isDirectory()))
      throw Error('Nonregular scoped path: ' + name);
  }
  return file;
}
function tree(root, prefix = '') {
  const result = [];
  for (const name of fs.readdirSync(root).sort()) {
    const relative = prefix + name, file = path.join(root, name), stat = fs.lstatSync(file);
    if (!safeName(relative) || stat.isSymbolicLink()) throw Error('Unsafe filesystem entry: ' + relative);
    if (stat.isDirectory()) result.push(...tree(file, relative + '/'));
    else if (stat.isFile()) result.push(relative);
    else throw Error('Nonregular filesystem entry: ' + relative);
  }
  return result;
}
function setup(root) { return {manifest: readJSON(path.join(root, 'MANIFEST.json')), baseline: readJSON(path.join(root, 'BASELINE.json'))}; }
function baselineSchema(baseline) {
  sameKeys(baseline, ['version', 'captured_at', 'backend', 'prerequisites', 'main', 'reader', 'pm2', 'verify_articles', 'original_covers']);
  if (baseline.version !== 1) throw Error('Baseline version mismatch');
  sameKeys(baseline.backend, BACKEND); sameKeys(baseline.prerequisites, PREREQUISITES);
  sameKeys(baseline.main, ['index', 'runtime_document', 'runtime_styles', 'runtime_home_css']);
  sameKeys(baseline.reader, ['index', 'node']); sameKeys(baseline.pm2, ['mooncci-api', 'mooncci-worker']);
  for (const [name, config] of Object.entries(baseline.pm2)) {
    sameKeys(config, CONFIG);
    if (config.max_memory_restart !== (name === 'mooncci-api' ? 450 : 300) * 1024 * 1024) throw Error('Unexpected PM2 memory budget');
  }
  for (const value of [...Object.values(baseline.backend).filter(x => x !== null), ...Object.values(baseline.prerequisites),
    ...Object.values(baseline.main), baseline.reader.index]) if (!/^[a-f0-9]{64}$/.test(value)) throw Error('Invalid raw baseline hash');
  if (!/^\/[A-Za-z0-9_./+-]+$/.test(baseline.reader.node)) throw Error('Unexpected inspected reader Node path');
  if (!Array.isArray(baseline.verify_articles) || ![17, 18].every(id => baseline.verify_articles.some(item => item.id === id)) ||
    baseline.verify_articles.some(item => !Number.isInteger(item.id) || item.id < 1 || typeof item.cover !== 'boolean')) throw Error('Invalid read-only article checks');
  for (const item of baseline.original_covers) if (!safeName(item.file) || !item.file.startsWith('uploads/') || !/^[a-f0-9]{64}$/.test(item.sha256)) throw Error('Invalid original cover hash');
}
function verifyPackage(root) {
  const {manifest, baseline} = setup(root); baselineSchema(baseline);
  const target = manifest.target;
  if (manifest.release !== 'cover-framing' || manifest.version !== 1 || !['main', 'reader'].includes(target) || !/^[a-f0-9]{40}$/.test(manifest.revision)) throw Error('Unexpected release manifest');
  if (manifest.configuration_changes !== false || manifest.dependency_install !== false ||
    !equal(manifest.backend_files, target === 'main' ? BACKEND : []) || !equal(manifest.migrations, target === 'main' ? [MIGRATION] : []) ||
    manifest.migration_runner !== (target === 'main' ? 'scripts/migrate-article-cover-crop.js' : null) ||
    !equal(manifest.restarts, target === 'main' ? ['mooncci-api', 'mooncci-worker'] : [])) throw Error('Unexpected deployment scope');
  const listed = fs.readFileSync(path.join(root, 'FILELIST'), 'utf8');
  if (listed.includes('\r') || !listed.endsWith('\n')) throw Error('Non-LF file list');
  const files = listed.trimEnd().split('\n');
  if (new Set(files).size !== files.length || !equal(files, [...files].sort()) || !equal(files, tree(root).sort())) throw Error('Extracted files differ from exact package list');
  const metadata = new Set(['deploy.sh', 'rollback.sh', 'verify.cjs', 'BASELINE.json', 'BACKEND_FILES', 'MANIFEST.json', 'FILELIST', 'SHA256SUMS']);
  if (target === 'main') metadata.add('backup.cjs');
  const required = [...metadata, 'dist/index.html', ...(target === 'main' ?
    [...BACKEND.map(name => 'server/' + name), 'server/database/migrations/' + MIGRATION,
      'server/scripts/migrate-article-cover-crop.js', 'server/runtime/document.mjs',
      'server/runtime/styles.json', 'server/runtime/home.css', 'server/runtime/node_modules/jsdom/package.json'] : [])];
  for (const name of required) if (!files.includes(name)) throw Error('Missing required package file: ' + name);
  for (const name of files) {
    const allowed = metadata.has(name) || name.startsWith('dist/') || target === 'main' &&
      (name.startsWith('server/runtime/') || name.startsWith('server/') && BACKEND.includes(name.slice(7)) ||
      name === 'server/database/migrations/' + MIGRATION || name === 'server/scripts/migrate-article-cover-crop.js');
    if (!allowed || /(?:^|\/)(?:\.env|schema\.sql|\.cache|\.git|credentials)(?:\/|$)/i.test(name) || name.endsWith('.node')) throw Error('Forbidden package scope: ' + name);
    if (name.endsWith('.sh') || name.endsWith('.sql') || metadata.has(name)) {
      const bytes = fs.readFileSync(path.join(root, name));
      if (bytes.includes(13) || bytes.length && bytes.at(-1) !== 10) throw Error('Non-LF script or metadata: ' + name);
    }
  }
  const checksums = fs.readFileSync(path.join(root, 'SHA256SUMS'), 'utf8').trimEnd().split('\n');
  const seen = [];
  for (const line of checksums) {
    const match = line.match(/^([a-f0-9]{64})  ([A-Za-z0-9_@+.,/-]+)$/);
    if (!match || !files.includes(match[2]) || match[2] === 'SHA256SUMS') throw Error('Unexpected checksum entry');
    if (sha(fs.readFileSync(plainFile(root, match[2]))) !== match[1]) throw Error('Package bytes changed: ' + match[2]);
    seen.push(match[2]);
  }
  if (!equal(seen.sort(), files.filter(name => name !== 'SHA256SUMS'))) throw Error('Missing or duplicate package checksum');
  const backendList = fs.readFileSync(path.join(root, 'BACKEND_FILES'), 'utf8');
  if (backendList !== (target === 'main' ? BACKEND.join('\n') + '\n' : '')) throw Error('Backend allowlist differs');
  const refs = references(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'));
  if (target === 'main') {
    for (const group of Object.values(readJSON(path.join(root, 'server/runtime/styles.json')))) refs.push(...group.css || [], ...group.js || []);
    refs.push(...cssReferences(fs.readFileSync(path.join(root, 'server/runtime/home.css'), 'utf8')));
  }
  for (const ref of refs) if (ref.startsWith('/assets/')) plainFile(root, 'dist' + ref.split(/[?#]/)[0]);
  return {manifest, baseline, files};
}
function roots(live, web, target) {
  if (target === 'main') {
    if (live !== '/www/wwwroot/mooncci-source/server' || web !== '/www/wwwroot/mooncci.site' || fs.realpathSync(live) !== live || fs.realpathSync(web) !== web) throw Error('Unexpected main roots');
  } else {
    if (!/^\/opt\/mooncci-reader\/releases\/[^/]+\/dist$/.test(web) || fs.realpathSync(web) !== web || fs.realpathSync('/opt/mooncci-reader/current/dist') !== web) throw Error('Reader current must resolve under releases');
  }
}
function digest(root, name) { const file = plainFile(root, name, true); return file ? sha(fs.readFileSync(file)) : null; }
function originalCovers(live, baseline) {
  for (const item of baseline.original_covers) if (digest(live, item.file) !== item.sha256) throw Error('Original cover changed: ' + item.file);
}
function verifyBaseline(root, live, web) {
  const {manifest, baseline} = verifyPackage(root); roots(live, web, manifest.target);
  if (digest(web, 'index.html') !== (manifest.target === 'main' ? baseline.main.index : baseline.reader.index)) throw Error('Frontend entry drift');
  if (manifest.target === 'main') {
    for (const [name, hash] of Object.entries({...baseline.backend, ...baseline.prerequisites})) if (digest(live, name) !== hash) throw Error('Backend/prerequisite drift: ' + name);
    for (const [name, hash] of [['runtime/document.mjs', baseline.main.runtime_document], ['runtime/styles.json', baseline.main.runtime_styles], ['runtime/home.css', baseline.main.runtime_home_css]])
      if (digest(live, name) !== hash) throw Error('Runtime entry drift: ' + name);
    originalCovers(live, baseline);
  }
}
function snapshot(root, live, web, folder) {
  const {manifest, baseline, files} = verifyPackage(root); roots(live, web, manifest.target);
  const before = {version: 1, target: manifest.target, live, web, backend: {}, frontend: {}, runtime: {}, original_covers: baseline.original_covers};
  for (const name of files.filter(name => name.startsWith('dist/')).map(name => name.slice(5))) before.frontend[name] = digest(web, name);
  if (manifest.target === 'main') {
    for (const name of BACKEND) before.backend[name] = digest(live, name);
    for (const name of tree(path.join(live, 'runtime'))) before.runtime[name] = digest(path.join(live, 'runtime'), name);
  }
  for (const [key, suffix] of [['frontend', 'WEB'], ['backend', 'BACKEND']]) {
    const entries = Object.entries(before[key]);
    fs.writeFileSync(path.join(folder, 'EXISTING_' + suffix), entries.filter(([, hash]) => hash !== null).map(([name]) => name + '\n').join(''));
    fs.writeFileSync(path.join(folder, 'NEW_' + suffix), entries.filter(([, hash]) => hash === null).map(([name]) => name + '\n').join(''));
  }
  fs.writeFileSync(path.join(folder, 'RUNTIME_FILES'), Object.keys(before.runtime).map(name => name + '\n').join(''));
  writeJSON(path.join(folder, 'BEFORE.json'), before);
  writeJSON(path.join(folder, 'BASELINE.json'), baseline);
  writeJSON(path.join(folder, 'MANIFEST.json'), manifest);
}
function restored(folder) {
  const before = readJSON(path.join(folder, 'BEFORE.json')); roots(before.live, before.web, before.target);
  for (const [key, root] of [['frontend', before.web], ['backend', before.live]]) for (const [name, expected] of Object.entries(before[key]))
    if (digest(root, name) !== expected) throw Error('Rollback bytes differ: ' + key + '/' + name);
  if (before.target === 'main') {
    const runtime = path.join(before.live, 'runtime');
    if (!equal(tree(runtime).sort(), Object.keys(before.runtime).sort())) throw Error('Rollback runtime file set differs');
    for (const [name, expected] of Object.entries(before.runtime)) if (digest(runtime, name) !== expected) throw Error('Rollback runtime bytes differ: ' + name);
    originalCovers(before.live, readJSON(path.join(folder, 'BASELINE.json')));
  }
}
function removeNew(folder) {
  const before = readJSON(path.join(folder, 'BEFORE.json')); roots(before.live, before.web, before.target);
  for (const [key, root] of [['frontend', before.web], ['backend', before.live]]) {
    for (const [name, expected] of Object.entries(before[key])) {
      if (expected !== null) continue;
      if (key === 'backend' && !BACKEND.includes(name)) throw Error('Unexpected newly created backend file');
      const file = plainFile(root, name, true);
      if (file) fs.unlinkSync(file);
    }
  }
}
function installed(root, live, web) {
  const {manifest, baseline, files} = verifyPackage(root); roots(live, web, manifest.target);
  for (const name of files) {
    let target;
    if (name.startsWith('dist/')) target = plainFile(web, name.slice(5));
    else if (name.startsWith('server/runtime/') || BACKEND.includes(name.replace(/^server\//, ''))) target = plainFile(live, name.slice(7));
    if (target && sha(fs.readFileSync(target)) !== sha(fs.readFileSync(path.join(root, name)))) throw Error('Installed bytes differ: ' + name);
  }
  if (manifest.target === 'main') {
    for (const [name, expected] of Object.entries(baseline.prerequisites)) if (digest(live, name) !== expected) throw Error('Prerequisite changed during deployment: ' + name);
    originalCovers(live, baseline);
  }
}
async function pm2(root, output) {
  let input = ''; for await (const chunk of process.stdin) input += chunk;
  const raw = JSON.parse(input), baseline = readJSON(path.join(root, 'BASELINE.json')), sanitized = {};
  for (const name of ['mooncci-api', 'mooncci-worker']) {
    const rows = raw.filter(item => item.name === name);
    if (rows.length !== 1 || rows[0].pm2_env.status !== 'online') throw Error('PM2 process unavailable: ' + name);
    const env = rows[0].pm2_env;
    sanitized[name] = Object.fromEntries(CONFIG.map(field => [field, field === 'node_args' ? [].concat(env[field] || []) : env[field]]));
    if (!equal(sanitized[name], baseline.pm2[name])) throw Error('PM2 configuration drift: ' + name);
  }
  if (output) writeJSON(output, sanitized);
}
function references(html) { return [...html.matchAll(/(?:src|href)=["'](\/[^"']+)["']/g)].map(match => match[1].replace(/&amp;/g, '&')); }
function cssReferences(css) { return [...css.matchAll(/url\(["']?(\/[^)"']+)/g)].map(match => match[1]); }
async function stage(root, live, runtime) {
  const {baseline} = setup(root);
  const env = require(path.join(live, 'node_modules/dotenv')).parse(fs.readFileSync(path.join(live, '.env')));
  process.env.PORT = env.PORT || '3001';
  const renderer = await import(pathToFileURL(path.join(runtime, 'document.mjs')).href);
  const {loadPublicResource} = require(path.join(live, 'src/lib/publicDocument.js'));
  const cache = new Map();
  const load = resource => {
    if (!cache.has(resource)) cache.set(resource, loadPublicResource(resource));
    return cache.get(resource);
  };
  for (const item of baseline.verify_articles) {
    const document = await renderer.renderDocument('/article/' + item.id, load);
    if (!document.html.includes(item.cover ? 'article-has-cover' : 'article-no-cover')) throw Error('Staged article SSR failed: ' + item.id);
  }
  // Render the real article payload with its cover removed only in memory.
  const fixture = await renderer.renderDocument('/article/17', async resource => {
    const data = await load(resource);
    return resource === '/posts/17' ? {...data, cover_image: '', cover_crop: null} : data;
  });
  if (!fixture.html.includes('article-no-cover') || !fixture.html.includes('hero-heading') || fixture.html.includes('class="hero-card"')) throw Error('No-cover SSR compatibility failed');
  const source = await load('/posts/17'), untouched = JSON.stringify(source);
  const testCrop = {card: {x: 0.8, y: 0.2, zoom: 2}, detail: {x: 0.25, y: 0.75, zoom: 1.5}};
  const testPost = {...source, cover_crop: testCrop};
  const withFixture = async resource => {
    const data = await load(resource);
    if (resource === '/posts/17') return testPost;
    if (/^\/posts(?:\?|$)/.test(resource)) {
      const items = Array.isArray(data) ? data : data.items;
      if (Array.isArray(items)) {
        const mapped = items.map(post => Number(post.id) === 17 ? {...post, cover_crop: testCrop} : post);
        if (!mapped.some(post => Number(post.id) === 17)) mapped.unshift(testPost);
        return Array.isArray(data) ? mapped : {...data, items: mapped};
      }
    }
    return data;
  };
  for (const [url, frame, container] of [['/article/17', testCrop.detail, 'hero-card'], ['/articles', testCrop.card, 'blog-card-cover'], ['/', testCrop.card, 'blog-card-cover']]) {
    const rendered = await renderer.renderDocument(url, withFixture);
    const images = [...rendered.html.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
    const style = `--cover-x:${frame.x * 100}%;--cover-y:${frame.y * 100}%;--cover-zoom:${frame.zoom}`;
    if (!rendered.html.includes(container) || !images.some(tag => tag.includes('cover-image--framed') && tag.includes(style)))
      throw Error('In-memory independent card/detail crop SSR proof failed: ' + url);
  }
  if (JSON.stringify(source) !== untouched) throw Error('SSR fixture mutated public payload');
  console.log('PASS: staged cover/no-cover and independent card/detail crops rendered entirely in memory');
}
function requestDocument(url) {
  return new Promise((resolve, reject) => {
    const request = https.get({hostname: 'mooncci.site', servername: 'mooncci.site', family: 4, port: 443, path: url,
      lookup: (_hostname, options, callback) => options.all
        ? callback(null, [{address: '127.0.0.1', family: 4}])
        : callback(null, '127.0.0.1', 4)}, response => {
      const chunks = [];
      response.on('data', data => chunks.push(data)); response.on('error', reject);
      response.on('end', () => response.statusCode === 200 ? resolve(Buffer.concat(chunks)) : reject(Error('Public document HTTP status: ' + response.statusCode)));
    });
    request.setTimeout(20000, () => request.destroy(Error('Public document timeout'))); request.on('error', reject);
  });
}
async function publicChecks(root, live, web, folder) {
  const {baseline} = setup(root), assets = new Set();
  const entryScripts = references(fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'))
    .filter(ref => ref.startsWith('/assets/') && /\.js(?:[?#]|$)/.test(ref));
  if (!entryScripts.length) throw Error('Missing release frontend entry');
  const health = await fetch('http://127.0.0.1:3001/api/health', {signal: AbortSignal.timeout(10000)});
  if (!health.ok || (await health.json()).ok !== true) throw Error('API health failed');
  for (const url of ['/', '/articles', ...baseline.verify_articles.map(item => '/article/' + item.id)]) {
    const bytes = await requestDocument(url), html = bytes.toString('utf8');
    if (entryScripts.some(ref => !references(html).includes(ref))) throw Error('SSR/frontend release entry mismatch: ' + url);
    if (!html.includes('mooncci-document-data') || !html.includes('data-document-hydrating="true"')) throw Error('SSR document/hydration missing: ' + url);
    const item = baseline.verify_articles.find(item => url === '/article/' + item.id);
    if (item && !html.includes(item.cover ? 'article-has-cover' : 'article-no-cover')) throw Error('Public article cover presentation mismatch');
    const match = html.match(/<script id="mooncci-document-data" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match || !readJSONData(match[1]).resources) throw Error('Missing SSR resource payload: ' + url);
    for (const ref of references(html)) if (ref.startsWith('/assets/')) assets.add(ref.split(/[?#]/)[0]);
    for (const css of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) for (const ref of cssReferences(css[1])) if (ref.startsWith('/assets/')) assets.add(ref.split(/[?#]/)[0]);
    fs.writeFileSync(path.join(folder, url === '/' ? 'home.html' : url.replace(/^\//, '').replace(/\//g, '-') + '.html'), bytes);
  }
  for (const ref of assets) {
    const expected = fs.readFileSync(plainFile(web, ref.slice(1)));
    if (sha(await requestDocument(ref)) !== sha(expected)) throw Error('SSR asset response differs: ' + ref);
  }
  const env = require(path.join(live, 'node_modules/dotenv')).parse(fs.readFileSync(path.join(live, '.env')));
  const mysql = require(path.join(live, 'node_modules/mysql2/promise'));
  const connection = await mysql.createConnection({host: env.DB_HOST || '127.0.0.1', port: Number(env.DB_PORT || 3306),
    user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, charset: 'utf8mb4'});
  const crop = require(path.join(live, 'src/lib/articleCoverCrop.js'));
  try {
    const [columns] = await connection.query("SHOW COLUMNS FROM posts LIKE 'cover_crop'");
    if (columns.length !== 1 || columns[0].Type.toLowerCase() !== 'json' || columns[0].Null !== 'YES') throw Error('Additive cover column mismatch');
    const [rows] = await connection.query("SELECT id,cover_image,cover_crop FROM posts WHERE status='published' ORDER BY id");
    for (const row of rows) {
      const response = await fetch('http://127.0.0.1:3001/api/posts/' + row.id, {signal: AbortSignal.timeout(10000)});
      if (!response.ok) throw Error('Published article API unavailable');
      const data = await response.json();
      if (!Object.hasOwn(data, 'cover_crop') || !equal(data.cover_crop, crop.readCoverCrop(row.cover_crop, row.cover_image))) throw Error('Published crop API/DB mismatch: ' + row.id);
    }
    const migration = fs.readFileSync(path.join(root, 'server/database/migrations/' + MIGRATION), 'utf8').trim();
    const [ledger] = await connection.query('SELECT checksum FROM schema_migrations WHERE filename=?', [MIGRATION]);
    if (ledger.length !== 1 || ledger[0].checksum !== sha(migration)) throw Error('Cover migration ledger mismatch');
    writeJSON(path.join(folder, 'acceptance.json'), {health: true, public_documents: 2 + baseline.verify_articles.length, assets: assets.size,
      published_crop_rows: rows.length, nullable_json: true, migration: MIGRATION, database_operations: 'read-only'});
  } finally { await connection.end(); }
  originalCovers(live, baseline);
}
function readJSONData(value) { return JSON.parse(value); }
module.exports = {safeName, plainFile, baselineSchema, verifyPackage, digest, snapshot, restored};
if (require.main === module) {
  (async () => {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'package') verifyPackage(args[0]);
    else if (command === 'baseline') verifyBaseline(...args);
    else if (command === 'snapshot') snapshot(...args);
    else if (command === 'restored' || command === 'snapshot-unchanged') restored(args[0]);
    else if (command === 'remove-new') removeNew(args[0]);
    else if (command === 'installed') installed(...args);
    else if (command === 'pm2') await pm2(...args);
    else if (command === 'stage') await stage(...args);
    else if (command === 'public') await publicChecks(...args);
    else throw Error('Unknown scoped verifier command');
    console.log('PASS: cover-framing ' + command);
  })().catch(error => { console.error('Cover-framing verification failed: ' + error.message); process.exitCode = 1; });
}
