// Read-only production snapshot: pass the JSON list from build-motion-seo-release.py on stdin.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {target}=require('./verify-bilingual-release.cjs');
const live='/www/wwwroot/mooncci-source/server';
const hash=file=>fs.existsSync(file)?crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null;
const names=JSON.parse(fs.readFileSync(0,'utf8'));
if(!Array.isArray(names)||new Set(names).size!==names.length||names.some(n=>typeof n!=='string'||!(/^(dist\/|server\/runtime\/|server\/database\/migrations\/202611120001_article_likes\.sql$|server\/src\/(?:index\.js|routes\/(?:account|articleLikes)\.js)$)/.test(n))))throw Error('Invalid release scope');
const files=Object.fromEntries(names.map(n=>[n,hash(target(n))]));
const prerequisites=Object.fromEntries(['package.json','package-lock.json'].map(n=>[n,hash(path.join(live,n))]));
if(Object.values(prerequisites).some(x=>x===null))throw Error('Missing dependency manifest');
console.log(JSON.stringify({version:1,captured_at:new Date().toISOString(),files,prerequisites},null,2));
