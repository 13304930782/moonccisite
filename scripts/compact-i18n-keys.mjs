import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const keyPattern = /^m_[a-f0-9]{10}$/;
export const shortMessageKey = key => keyPattern.test(key) ? `m_${Buffer.from(key.slice(2), 'hex').toString('base64url')}` : key;
export function compactCatalog(catalog) {
  return Object.fromEntries(Object.entries(catalog).map(([key,value]) => [shortMessageKey(key),value]));
}
export function compactMessageSource(code, filename, catalog) {
  if (!code.includes('m_')) return code;
  const ast = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(filename) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const replacements = [];
  function visit(node) {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && keyPattern.test(node.text) && Object.hasOwn(catalog,node.text)) {
      replacements.push([node.getStart(ast)+1,node.end-1,shortMessageKey(node.text)]);
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);
  for (const [start,end,value] of replacements.reverse()) code=code.slice(0,start)+value+code.slice(end);
  return code;
}
export function compactI18nKeys() {
  let root, catalog;
  const virtual = '\0mooncci-compact-zh';
  return {
    name:'compact-i18n-keys', apply:'build', enforce:'pre',
    configResolved(config) { root=config.root; catalog=JSON.parse(fs.readFileSync(path.join(root,'src/app/i18n/zh.json'),'utf8')); },
    resolveId(id, importer) { if (id==='./zh.json?url' && /[\\/]src[\\/]app[\\/]i18n[\\/]index\.ts$/.test(importer || '')) return virtual; },
    load(id) { if(id===virtual) { const ref=this.emitFile({type:'asset',name:'zh-compact.json',source:JSON.stringify(compactCatalog(catalog))}); return `export default import.meta.ROLLUP_FILE_URL_${ref}`; } },
    transform(code,id) {
      if (!id.startsWith(root) || !/\.[jt]sx?$/.test(id) || id.includes('node_modules')) return;
      const transformed=compactMessageSource(code,id,catalog);
      const result=id.replaceAll('\\','/').endsWith('/src/app/i18n/index.ts') ? transformed.replace('/^m_[a-f0-9]{10}$/','/^m_(?:[a-f0-9]{10}|[A-Za-z0-9_-]{7})$/') : transformed;
      return result===code ? undefined : {code:result,map:null};
    },
  };
}
