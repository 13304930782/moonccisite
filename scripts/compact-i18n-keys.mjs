import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const keyPattern = /^m_[a-f0-9]{10}$/;
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
export function createMessageKeyMap(catalog) {
  const map = new Map();
  const untouched = new Set(Object.keys(catalog).filter(key => !keyPattern.test(key)));
  for (const [index,key] of Object.keys(catalog).filter(key => keyPattern.test(key)).sort().entries()) {
    let ordinal = index, encoded = '';
    do { encoded = alphabet[ordinal % 64] + encoded; ordinal = Math.floor(ordinal / 64); } while (ordinal);
    const compact = `~${encoded.padStart(2, 'A')}`;
    if (untouched.has(compact)) throw new Error(`Compacted message key collides with catalog key: ${compact}`);
    map.set(key, compact);
  }
  return map;
}
export const shortMessageKey = (key, map) => map?.get(key) || (keyPattern.test(key) ? `~${Buffer.from(key.slice(2), 'hex').toString('base64url')}` : key);
export function compactCatalog(catalog, map = createMessageKeyMap(catalog)) {
  return Object.fromEntries(Object.entries(catalog).map(([key,value]) => [shortMessageKey(key,map),value]));
}
export function compactMessageSource(code, filename, catalog, map = createMessageKeyMap(catalog)) {
  if (!code.includes('m_')) return code;
  const ast = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(filename) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const replacements = [];
  function visit(node) {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && keyPattern.test(node.text) && Object.hasOwn(catalog,node.text)) {
      replacements.push([node.getStart(ast)+1,node.end-1,shortMessageKey(node.text,map)]);
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);
  for (const [start,end,value] of replacements.reverse()) code=code.slice(0,start)+value+code.slice(end);
  return code;
}
export function compactI18nKeys() {
  let root, catalog, map, width;
  const virtual = '\0mooncci-compact-zh';
  return {
    name:'compact-i18n-keys', apply:'build', enforce:'pre',
    configResolved(config) { root=config.root; catalog=JSON.parse(fs.readFileSync(path.join(root,'src/app/i18n/zh.json'),'utf8')); map=createMessageKeyMap(catalog); width=[...map.values()].reduce((max,key)=>Math.max(max,key.length-1),2); },
    resolveId(id, importer) { if (id==='./zh.json?url' && /[\\/]src[\\/]app[\\/]i18n[\\/]index\.ts$/.test(importer || '')) return virtual; },
    load(id) { if(id===virtual) { const ref=this.emitFile({type:'asset',name:'zh-compact.json',source:JSON.stringify(compactCatalog(catalog,map))}); return `export default import.meta.ROLLUP_FILE_URL_${ref}`; } },
    transform(code,id) {
      if (!id.startsWith(root) || !/\.[jt]sx?$/.test(id) || id.includes('node_modules')) return;
      const transformed=compactMessageSource(code,id,catalog,map);
      const result=id.replaceAll('\\','/').endsWith('/src/app/i18n/index.ts') ? transformed.replace('/^m_[a-f0-9]{10}$/',`/^(?:m_[a-f0-9]{10}|~[A-Za-z0-9_-]{2,${width}}|~[A-Za-z0-9_-]{7})$/`) : transformed;
      return result===code ? undefined : {code:result,map:null};
    },
  };
}
