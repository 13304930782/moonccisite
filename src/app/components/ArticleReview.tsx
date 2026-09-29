import {CheckCircle2, CircleAlert, CircleDashed} from 'lucide-react';
import {ThemeSelect} from './ThemeSelect';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArticlePresentation} from './ArticlePresentation';
import {checkArticleImage} from '../lib/checkArticleImage';
const srcDoc='<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="preview-root" class="neo-page" style="padding:20px"></div></body></html>';
export function ArticleReview({post,onPublish,busy,disabled=false,publishLabel='确认发布'}:{post:any;onPublish:()=>void;busy:boolean;disabled?:boolean;publishLabel?:string}){
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
  const rendered=Array.from(root.querySelectorAll('img'));
  const urls=[...new Set(rendered.map(i=>i.src))];
  if(urls.length>80)errors.push('图片超过 80 张，请分篇发布后再检查。');
  let next=0;await Promise.all(Array.from({length:Math.min(4,urls.length)},async()=>{while(next<Math.min(80,urls.length)){const i=next++,url=urls[i];const result=await checkArticleImage(url,rendered);if(result==='timeout')errors.push(`图片 ${i+1} 加载超时（等待超过 20 秒），请稍后重新检查：${url}`);else if(result==='failed')errors.push(`图片 ${i+1} 加载失败，请打开图片地址确认后重新检查：${url}`);}}));
  for(const match of String(post.content||'').matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)){try{const u=new URL(match[1],location.origin);if(!['http:','https:','mailto:'].includes(u.protocol))errors.push('正文含不支持的链接协议，请修正 Markdown 链接。');}catch{errors.push('正文含格式无效的链接。');}}
  const anchors=Array.from(root.querySelectorAll('a'));let external=0;for(const a of anchors){const href=a.getAttribute('href')||'';try{const u=new URL(href,location.origin);if(!['http:','https:','mailto:'].includes(u.protocol))errors.push('有不支持的链接协议。');if(u.origin!==location.origin&&u.protocol!=='mailto:')external++;}catch{errors.push('有格式无效的链接。');}}
  if(external)warnings.push(`${external} 个外部链接仅检查格式，发布前请自行打开确认内容。`);
  if(!post.category)warnings.push('尚未设置分类。');if(!post.summary)warnings.push('尚未填写摘要。');
  if(id===run.current){setReport({snapshot,errors,warnings});setChecking(false);}
 }
 const current=report?.snapshot===snapshot;
 const passed=current&&report.errors.length===0;
 const StatusIcon=passed?CheckCircle2:current&&report.errors.length?CircleAlert:CircleDashed;
 return <section className="article-review">
  <div className="article-review-toolbar"><label>预览设备<ThemeSelect aria-label="预览设备" value={String(width)} onValueChange={v=>setWidth(Number(v))}><option value="375">手机 · 375px</option><option value="768">平板 · 768px</option><option value="1024">桌面 · 1024px</option></ThemeSelect></label><button className={passed?'article-button':'article-button article-button-primary'} onClick={()=>void check()} disabled={checking||!root||busy}>{checking?'正在检查图片…':report?'重新检查':'运行发布前检查'}</button></div>
  <div role="status" className="article-review-result" aria-live="polite"><StatusIcon size={20} aria-hidden="true"/><div><h2>{checking?'正在检查':!current?report?'内容已修改，请重新检查':'尚未检查':passed?'检查通过，可以继续':'检查尚未通过'}</h2>
   {checking?<p>正在确认标题、正文和图片是否可用。</p>:!current?<p>先运行检查，再核对下方的文章排版。</p>:<>{report.errors.length>0&&<ul>{report.errors.map((x,i)=><li key={i}>{x}</li>)}</ul>}{report.warnings.length>0&&<details><summary>发布前建议 · {report.warnings.length} 项</summary><ul>{report.warnings.map((x,i)=><li key={i}>{x}</li>)}</ul></details>}{passed&&<p>标题、正文和图片已检查。请确认预览效果后{publishLabel.includes('审核')?'提交审核':'发布'}。</p>}</>}
  </div></div>
  <div className="article-preview-label"><h2>文章预览</h2><p>独立设备视口 · 窄屏可横向查看大尺寸预览</p></div>
  <div className="article-review-scroll"><iframe title="文章设备预览" ref={frame} srcDoc={srcDoc} sandbox="allow-same-origin" onLoad={()=>void ready()} style={{width,height:620}}/>{root&&createPortal(<ArticlePresentation preview post={post}/>,root)}</div>
  <div className="article-review-footer"><p>{checking?'检查完成后即可继续。':!current?'请先完成发布前检查。':!passed?'加载超时可重新检查；内容问题请返回编辑修正。':publishLabel.includes('审核')?'提交后由管理员审核。':'确认后，文章将更新到网站。'}</p><button className="article-review-publish article-button article-button-primary" disabled={disabled||busy||checking||!passed} onClick={onPublish}>{busy?'正在保存…':publishLabel}</button></div>
 </section>;
}
