const Turndown=require('turndown');
const domino=require('@mixmark-io/domino');
const {validateUrl,error}=require('./articleImportFetch');
function text(html){return domino.createDocument(String(html||'')).body.textContent.trim();}
function convertPost(post, source, origins) {
 if(post.status!=='publish'||post.type!=='post')throw error('只支持旧站公开文章。');
 const doc=domino.createDocument(String(post.content?.rendered||''));
 for(const el of Array.from(doc.querySelectorAll('script,style,iframe,form,button,input,object,embed,noscript,svg')))el.remove();
 const images=[];const warnings=[];
 for(const img of Array.from(doc.querySelectorAll('img'))){
  const src=img.getAttribute('data-src')||img.getAttribute('data-original')||img.getAttribute('src');
  if(!src)throw error('正文有缺少地址的图片，请先修复旧文章。');
  const url=validateUrl(new URL(src,source).href,origins).href;
  let i=images.findIndex(x=>x.source===url);if(i<0){i=images.length;images.push({source:url,alt:(img.getAttribute('alt')||`原文图片 ${i+1}`).slice(0,255)});}
  img.setAttribute('src',`mooncci-import-image-${i}`);img.removeAttribute('srcset');img.removeAttribute('title');
 }
 if(images.length>40)throw error('单次最多导入 40 张图片，请拆分文章。');
 for(const a of Array.from(doc.querySelectorAll('a'))){
  const href=a.getAttribute('href');if(!href)continue;
  if(a.querySelector('img')){a.removeAttribute('href');continue;}
  try{const u=new URL(href,source);if(!['http:','https:','mailto:'].includes(u.protocol))throw Error();a.setAttribute('href',u.href);}catch{a.removeAttribute('href');}
 }
 const service=new Turndown({headingStyle:'atx',codeBlockStyle:'fenced',bulletListMarker:'-'});
 service.addRule('boldSectionHeading',{filter:n=>n.nodeName==='P'&&/^[一二三四五六七八九十]+、/.test(n.textContent.trim())&&Array.from(n.childNodes).every(c=>c.nodeType===3?!c.textContent.trim():['B','STRONG'].includes(c.nodeName)),replacement:(_c,n)=>'\n\n## '+n.textContent.trim()+'\n\n'});
 service.addRule('table',{filter:'table',replacement:(_c,n)=>{const rows=Array.from(n.querySelectorAll('tr')).map(r=>Array.from(r.querySelectorAll('th,td')).map(c=>text(c.innerHTML).replace(/[\\|]/g,'\\$&').replace(/\s+/g,' ')));if(!rows.length)return '';const width=Math.max(...rows.map(r=>r.length));const line=r=>'| '+Array.from({length:width},(_,i)=>r[i]||'').join(' | ')+' |';return '\n\n'+[line(rows[0]),line(Array(width).fill('---')),...rows.slice(1).map(line)].join('\n')+'\n\n';}});
 const terms=(post._embedded?.['wp:term']||[]).flat();
 const date=String(post.date||'');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))throw error('旧文章发布时间无效。');
 const payload={title:text(post.title?.rendered).slice(0,255),slug:String(post.slug||'').slice(0,255),summary:text(post.excerpt?.rendered).slice(0,10000),content:service.turndown(doc.body),cover_image:'',category:text(terms.find(t=>t.taxonomy==='category')?.name).slice(0,100),tags:terms.filter(t=>t.taxonomy==='post_tag').map(t=>text(t.name)).slice(0,20),published_at:date.replace('T',' '),source_url:source};
 const cover=post._embedded?.['wp:featuredmedia']?.[0]?.source_url;
 if(cover){const url=validateUrl(new URL(cover,source).href,origins).href;let i=images.findIndex(x=>x.source===url);if(i<0){i=images.length;images.push({source:url,alt:payload.title});}payload.cover_image=`mooncci-import-image-${i}`;}
 if(images.length>40||!payload.title||!payload.content||payload.content.length>500000)throw error('文章为空或超出导入限制。');
 if(doc.querySelector('video,audio'))warnings.push('原文包含音视频，请在草稿中核对媒体内容。');
 return {payload,images,warnings};
}
module.exports={convertPost};
