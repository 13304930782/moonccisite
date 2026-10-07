import tailwindcss from '@tailwindcss/vite';
import {build} from 'vite';
import path from 'node:path';
import fs from 'node:fs/promises';
const root = process.cwd();
await build({define:{'process.env.NODE_ENV':JSON.stringify('production')},configFile:false, plugins:[tailwindcss(),{
  name:'server-rich-text', resolveId(id) { if(id === 'dompurify') return path.join(root,'server/render/sanitizer.mjs'); },
}], resolve:{alias:[{find:/^dompurify$/,replacement:path.join(root,'server/render/sanitizer.mjs')},{find:'@',replacement:path.join(root,'src')}]}, ssr:{noExternal:true, external:['jsdom']},
  build:{ssr:'server/render/entry.tsx', outDir:'server/runtime', emptyOutDir:true, minify:false,
    ssrEmitAssets:true, cssCodeSplit:false,
    rollupOptions:{output:{entryFileNames:'document.mjs',chunkFileNames:'chunks/[name]-[hash].mjs'}}}
});
const manifest=JSON.parse(await fs.readFile('dist/asset-manifest.json','utf8'));
const assets={};
for(const [key,entry] of Object.entries(manifest)) {
  if(!entry.isDynamicEntry&&key!=='index.html')continue;
  const seen=new Set(), css=new Set(), js=new Set();
  function visit(name) { if(seen.has(name))return;seen.add(name);const item=manifest[name];if(!item)return;for(const dep of item.imports||[])visit(dep);for(const file of item.css||[])css.add('/'+file);if(item.file.endsWith('.js'))js.add('/'+item.file); }
  visit(key);assets[entry.name]={css:[...css],js:[...js]};
}
await fs.writeFile('server/runtime/styles.json',JSON.stringify(assets)+'\n');
