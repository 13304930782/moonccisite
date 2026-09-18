import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArticlePresentation} from './ArticlePresentation';
const srcDoc='<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="preview-root" class="neo-page" style="padding:20px"></div></body></html>';
export function ArticleReview({post,onPublish,busy}:{post:any;onPublish:()=>void;busy:boolean}){
 const frame=useRef<HTMLIFrameElement>(null);const [root,setRoot]=useState<HTMLElement|null>(null),[width,setWidth]=useState(375),[checking,setChecking]=useState(false),[report,setReport]=useState<{snapshot:string;errors:string[];warnings:string[]}|null>(null);const run=useRef(0);const snapshot=JSON.stringify(post);
 useEffect(()=>()=>{run.current++;},[]);
 async function ready(){const doc=frame.current?.contentDocument;if(!doc)return;
 const loads=Array.from(document.querySelectorAll('link[rel="stylesheet"],style')).map(el=>{const copy=el.cloneNode(true) as HTMLElement;if(copy instanceof HTMLLinkElement){copy.href=(el as HTMLLinkElement).href;return new Promise<void>(resolve=>{copy.onload=()=>resolve();copy.onerror=()=>resolve();doc.head.appendChild(copy);});}doc.head.appendChild(copy);return Promise.resolve();});
 doc.documentElement.classList.toggle('dark',document.documentElement.classList.contains('dark'));
 const style=doc.createElement('style');style.textContent='html{scrollbar-gutter:auto}body{margin:0}.detail-preview{max-width:680px;margin:auto}';doc.head.appendChild(style);
 await Promise.all(loads);if(frame.current?.contentDocument===doc)setRoot(doc.getElementById('preview-root'));
 }
 async function check(){if(!root)return;const id=++run.current;setChecking(true);const errors:string[]=[],warnings:string[]=[];
  if(!post.title?.trim())errors.push('请填写文章标题。');if(!post.content?.trim())errors.push('请填写正文。');
  const urls=[...new Set(Array.from(root.querySelectorAll('img')).map(i=>i.src))];
  if(urls.length>80)errors.push('图片超过 80 张，请分篇发布后再检查。');
  let next=0;await Promise.all(Array.from({length:Math.min(4,urls.length)},async()=>{while(next<Math.min(80,urls.length)){const i=next++,url=urls[i];const ok=await new Promise<boolean>(resolve=>{const image=new Image();const timer=setTimeout(()=>finish(false),10000);function finish(value:boolean){clearTimeout(timer);image.onload=null;image.onerror=null;resolve(value);}image.onload=()=>finish(image.naturalWidth>0);image.onerror=()=>finish(false);image.src=url;});if(!ok)errors.push(`图片 ${i+1} 无法加载：${url}`);}}));
  for(const match of String(post.content||'').matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)){try{const u=new URL(match[1],location.origin);if(!['http:','https:','mailto:'].includes(u.protocol))errors.push('正文含不支持的链接协议，请修正 Markdown 链接。');}catch{errors.push('正文含格式无效的链接。');}}
  const anchors=Array.from(root.querySelectorAll('a'));let external=0;for(const a of anchors){const href=a.getAttribute('href')||'';try{const u=new URL(href,location.origin);if(!['http:','https:','mailto:'].includes(u.protocol))errors.push('有不支持的链接协议。');if(u.origin!==location.origin&&u.protocol!=='mailto:')external++;}catch{errors.push('有格式无效的链接。');}}
  if(external)warnings.push(`${external} 个外部链接仅检查格式，发布前请自行打开确认内容。`);
  if(!post.category)warnings.push('尚未设置分类。');if(!post.summary)warnings.push('尚未填写摘要。');
  if(id===run.current){setReport({snapshot,errors,warnings});setChecking(false);}
 }
 const current=report?.snapshot===snapshot;
 return <section className="article-review"><div className="article-review-toolbar"><label>预览设备<select aria-label="预览设备" value={width} onChange={e=>setWidth(Number(e.target.value))}><option value={375}>手机 · 375px</option><option value={768}>平板 · 768px</option><option value={1024}>桌面 · 1024px</option></select></label><button onClick={()=>void check()} disabled={checking||!root}>{checking?'正在检查图片…':'运行发布前检查'}</button></div><p>预览使用独立视口；窄屏下可横向查看平板和桌面效果。</p><div className="article-review-scroll"><iframe title="文章设备预览" ref={frame} srcDoc={srcDoc} sandbox="allow-same-origin" onLoad={()=>void ready()} style={{width,height:620}}/>{root&&createPortal(<ArticlePresentation preview post={post}/>,root)}</div>{report&&<div role="status" className="article-review-result"><h2>{!current?'内容已修改，请重新检查':report.errors.length?'发现需要修复的问题':'检查通过'}</h2>{report.errors.map((x,i)=><p key={'e'+i}>{x}</p>)}{report.warnings.map((x,i)=><p key={'w'+i}>{x}</p>)}{current&&!report.errors.length&&<p>图片可加载，标题和正文已填写。请再核对设备预览的排版。</p>}</div>}<button className="article-review-publish" disabled={busy||checking||!current||!!report?.errors.length} onClick={onPublish}>{busy?'正在保存 / 发布…':'确认发布'}</button></section>;
}
