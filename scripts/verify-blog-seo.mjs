// Read-only production checks; run after API/frontend deployment AND Nginx activation.
const origin=new URL(process.argv[2]||'https://mooncci.site');
async function get(path){const r=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return r;}
const posts=await(await get('/api/posts?limit=1')).json();
if(posts.length){const p=posts[0];const r=await get(`/article/${p.id}`),html=await r.text();if(!html.includes('type="application/ld+json"')||!html.includes('property="og:title"')||!html.includes('article:modified_time'))throw Error('Article HTML lacks server-rendered metadata; check Nginx routes');console.log('PASS article HTML metadata');}
const missing=await fetch(new URL('/article/0',origin));if(missing.status!==404)throw Error(`Missing article returned ${missing.status}, expected 404`);
const xml=await(await get('/sitemap.xml')).text();if(!xml.includes('<urlset'))throw Error('Invalid sitemap');
const robots=await(await get('/robots.txt')).text();if(!robots.includes('Sitemap:'))throw Error('Invalid robots');
const image=await get('/default-share.png');if(!image.headers.get('content-type')?.startsWith('image/'))throw Error('Share image not served as an image');
const privatePage=await get('/account/settings');if(!privatePage.headers.get('x-robots-tag')?.includes('noindex'))throw Error('Private page lacks noindex header');
console.log('PASS missing article 404, sitemap, robots, default share image and private page noindex');
