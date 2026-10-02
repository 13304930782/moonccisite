const fs = require('node:fs'), path = require('node:path');
const { autoconfig } = require('../server/src/lib/mailClient');
const target = path.join(__dirname, '../public/mail/config-v1.1.xml');
const content = autoconfig();
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== content) throw new Error('Stale Autoconfig: run node scripts/generate-mail-autoconfig.cjs');
} else fs.writeFileSync(target, content);
