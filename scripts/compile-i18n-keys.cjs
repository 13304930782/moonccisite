const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const catalogFile = path.join(root, 'src/app/i18n/zh.json');
const catalog = fs.existsSync(catalogFile) ? JSON.parse(fs.readFileSync(catalogFile, 'utf8')) : {};
let changes = 0;
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'i18n') scan(file); continue; }
    if (!/\.tsx?$/.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const edits = [];
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 't' && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && /\p{Script=Han}/u.test(node.arguments[0].text)) {
        const argument = node.arguments[0], text = argument.text;
        const key = 'm_' + crypto.createHash('sha256').update(text).digest('hex').slice(0, 10);
        if (catalog[key] && catalog[key] !== text) throw new Error(`Catalog key collision: ${key}`);
        catalog[key] = text;
        edits.push([argument.getStart(ast), argument.end, JSON.stringify(key)]);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    if (edits.length) {
      let output = source;
      for (const [start, end, value] of edits.sort((a,b) => b[0]-a[0])) output = output.slice(0,start)+value+output.slice(end);
      fs.writeFileSync(file, output);
      changes += edits.length;
    }
  }
}
scan(path.join(root, 'src'));
fs.writeFileSync(catalogFile, JSON.stringify(Object.fromEntries(Object.entries(catalog).sort(([a],[b]) => a.localeCompare(b))), null, 2)+'\n');
console.log(`Compiled ${changes} message references; ${Object.keys(catalog).length} stable source keys.`);
