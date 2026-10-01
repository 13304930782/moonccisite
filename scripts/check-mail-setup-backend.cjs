// Run FROM the extracted backend package; no writes and no secrets read.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = process.argv[2];
if (!root || !path.isAbsolute(root)) throw Error('Pass the confirmed absolute server directory');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const expected = JSON.parse(fs.readFileSync('BASELINE.json', 'utf8'));
for (const [name, previous] of Object.entries(expected)) {
  if (!/^src\/(?:index\.js|config\/mail-client\.json|lib\/mailClient\.js|routes\/mailSetup\.js)$/.test(name)) throw Error('Invalid scope');
  const live = path.join(root, name);
  const current = fs.existsSync(live) ? hash(fs.readFileSync(live)) : null;
  const next = hash(fs.readFileSync(path.join('server', name)));
  if (current !== previous && current !== next) throw Error('Live baseline differs; inspect before continuing: '+name);
}
console.log('PASS: scoped backend baseline matches; no files changed.');
