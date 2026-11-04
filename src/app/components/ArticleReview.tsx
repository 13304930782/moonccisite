import { useI18n } from '../i18n';
import {isRichText,richTextHasContent} from '../lib/richText';
import {stripLegacyAgeNotice} from '../lib/articleAge';
import {CheckCircle2, CircleAlert, CircleDashed} from 'lucide-react';
import {ThemeSelect} from './ThemeSelect';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArticlePresentation} from './ArticlePresentation';
import {EmbeddedPlayback} from './RichTextContent';
import {checkArticleImage} from '../lib/checkArticleImage';
type ImageIssue = {url:string; index:number; result:'failed'|'timeout'};
const srcDoc='<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="preview-root" class="neo-page"></div></body></html>';
export function ArticleReview({post,onPublish,busy,disabled=false,publishLabel='确认发布',onFix}:{post:any;onPublish:()=>void;busy:boolean;disabled?:boolean;publishLabel?:string;onFix?:(field:string)=>void}){
  const { t } = useI18n();
 const description=stripLegacyAgeNotice(post.summary).trim();
 const [previewFailed,setPreviewFailed]=useState(false),[previewAttempt,setPreviewAttempt]=useState(0);
 const frame=useRef<HTMLIFrameElement>(null);const [root,setRoot]=useState<HTMLElement|null>(null),[width,setWidth]=useState(375),[checking,setChecking]=useState(false),[report,setReport]=useState<{snapshot:string;errors:string[];warnings:string[];imageIssues:ImageIssue[]}|null>(null);const run=useRef(0);const [retryUrl,setRetryUrl]=useState<string|null>(null);const resultHeading=useRef<HTMLHeadingElement>(null);const snapshot=JSON.stringify(post);const preview=useMemo(()=> <ArticlePresentation preview post={post}/>,[snapshot]);
 useEffect(()=>()=>{run.current++;},[]);
 const ready=useCallback(()=>{const doc=frame.current?.contentDocument,element=doc?.getElementById('preview-root');if(!doc||!element)return;
 // Mount the preview as soon as its document exists. A stalled stylesheet must
 // never keep the portal empty or disable publication checks indefinitely.
 if(!doc.head.querySelector('[data-article-preview-styles]')){
 for(const el of Array.from(document.querySelectorAll('link[rel="stylesheet"],style'))){const copy=el.cloneNode(true) as HTMLElement;if(copy instanceof HTMLLinkElement)copy.href=(el as HTMLLinkElement).href;doc.head.appendChild(copy);}
 const style=doc.createElement('style');style.dataset.articlePreviewStyles='';style.textContent='html{scrollbar-gutter:auto}body{margin:0}.detail-preview{max-width:none;margin:auto}';doc.head.appendChild(style);
 }
 doc.documentElement.classList.toggle('dark',document.documentElement.classList.contains('dark'));
 setRoot(element);
 },[]);
 // onLoad can race React attaching its handler when srcDoc is already cached.
 // Also observe document readiness without waiting for all subresources to load.
 useEffect(()=>{if(root)return;ready();const timer=window.setInterval(ready,100);const timeout=window.setTimeout(()=>{window.clearInterval(timer);setPreviewFailed(true);},10000);return()=>{window.clearInterval(timer);window.clearTimeout(timeout);};},[ready,root,previewAttempt]);
 async function check(){if(!root)return;const id=++run.current;setChecking(true);const errors:string[]=[],warnings:string[]=[],imageIssues:ImageIssue[]=[];
  if(!post.title?.trim())errors.push(t("m_26511d79d8"));if(!richTextHasContent(post.content || ''))errors.push(t("m_1329671db3"));
  const rendered=Array.from(root.querySelectorAll('img'));
  const urls=[...new Set(rendered.map(i=>i.src))];
  if(urls.length>80)errors.push(t("m_c39472a187"));
  let next=0;await Promise.all(Array.from({length:Math.min(4,urls.length)},async()=>{while(next<Math.min(80,urls.length)){const i=next++,url=urls[i];const result=await checkArticleImage(url,rendered);if(result!=='loaded')imageIssues.push({url,index:i+1,result});}}));
  for(const match of (isRichText(post.content || '') ? '' : String(post.content||'')).matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)){try{const u=new URL(match[1],location.origin);if(!['http:','https:','mailto:'].includes(u.protocol))errors.push(t("m_224f1520eb"));}catch{errors.push(t("m_ed8f84114e"));}}
  const anchors=Array.from(root.querySelectorAll('a'));let external=0;for(const a of anchors){const href=a.getAttribute('href')||'';try{const u=new URL(href,location.origin);if(!['http:','https:','mailto:'].includes(u.protocol))errors.push(t("m_3a4a6bcc4f"));if(u.origin!==location.origin&&u.protocol!=='mailto:')external++;}catch{errors.push(t("m_d7ecd472b1"));}}
  if(external)warnings.push(t("m_4dd9cf84fe", {v0: external}));
  if(!post.category)warnings.push(t("m_df2bb858cc"));if(!description)warnings.push(t("m_e9511350c2"));
  const summaryLength=Array.from(description).length;
  if(description&&(summaryLength<25||summaryLength>160))warnings.push(t("m_0c8021f359", {v0: summaryLength}));
  if(post.summary_mode==='ai'&&!post.summary_receipt)errors.push(t("m_cd18a71aa8"));
  if(id===run.current){setReport({snapshot,errors,warnings,imageIssues:imageIssues.sort((a,b)=>a.index-b.index)});setChecking(false);}
 }
 async function retryImage(issue:ImageIssue){
  if(!root||!report||report.snapshot!==snapshot||checking)return;
  const id=++run.current,captured=report;setChecking(true);setRetryUrl(issue.url);
  const result=await checkArticleImage(issue.url,Array.from(root.querySelectorAll('img')));
  if(id!==run.current)return;
  if(result==='loaded')for(const image of Array.from(root.querySelectorAll('img')))if(image.src===issue.url&&(!image.complete||!image.naturalWidth))image.src=issue.url;
  setReport({...captured,imageIssues:captured.imageIssues.flatMap(item=>item.url!==issue.url?[item]:result==='loaded'?[]:[{...item,result}])});
  setChecking(false);setRetryUrl(null);resultHeading.current?.focus({preventScroll:true});
 }
 const current=report?.snapshot===snapshot;
 const passed=current&&report.errors.length===0&&report.imageIssues.length===0;
 const StatusIcon=passed?CheckCircle2:current&&(report.errors.length||report.imageIssues.length)?CircleAlert:CircleDashed;
 return <section className="article-review">
  <section className="article-review-result"><div><h2>{t("m_5c78e4b3a7")}</h2><strong>{post.title} · mooncci</strong><p>{description||t("m_adf90cb6e3")}</p><small>{Array.from(description).length}  {t("m_1afabfd4e4")} {post.summary_mode==='ai'?t("m_2b376005fd"):t("m_81bd24af45")}  {t("m_b83e9789dc")}</small></div></section>
  <div className="article-review-toolbar"><label>{t("m_cb1783cd73")}<ThemeSelect aria-label={t("m_cb1783cd73")} value={String(width)} onValueChange={v=>setWidth(Number(v))}><option value="375">{t("m_7fd6ae67f4")}</option><option value="768">{t("m_ab76612c10")}</option><option value="1024">{t("m_14a022bbbd")}</option></ThemeSelect></label><button className={passed?'article-button':'article-button article-button-primary'} onClick={()=>void check()} disabled={checking||!root||busy}>{checking?t("m_5864548fa6"):!root?t("m_9cbeebf62a"):report?t("m_c25fb86b1e"):t("m_3cfc34804e")}</button></div>
  <div role="status" className="article-review-result" aria-live="polite"><StatusIcon size={20} aria-hidden="true"/><div><h2 ref={resultHeading} tabIndex={-1}>{checking?t("m_d85ff08f91"):!current?report?t("m_d85a1de6ef"):t("m_cdbc0434f5"):passed?t("m_8afadfb31d"):t("m_28feff4591")}</h2>
   {checking?<p>{retryUrl?t("m_a4090d97a4"):t("m_188778140f")}</p>:!current?<p>{t("m_7eb2cbcdbe")}</p>:<>{report.errors.length>0&&<><h3>{t("m_24a533d0c7")}</h3><ul>{report.errors.map((x,i)=><li key={i}>{x}{onFix&&<button className="text-link" onClick={()=>onFix(x.includes(t("m_c3405f8c7d"))?'title':'content')}>{t("m_e1b65a8f78")}</button>}</li>)}</ul></>}{report.imageIssues.length>0&&<ul className="article-image-issues">{report.imageIssues.map(issue=><li key={issue.url}><strong>{t("m_d24c10d37d")} {issue.index} {issue.result==='timeout'?t("m_e18a99e0af"):t("m_d1d044826a")}</strong><p>{issue.result==='timeout'?t("m_244d596011"):t("m_62489eb410")}</p><div className="inline-actions"><button className="article-button" disabled={checking||busy} onClick={()=>void retryImage(issue)}>{t("m_a8add161ee")} {issue.index}</button><a className="article-button" href={issue.url} target="_blank" rel="noopener noreferrer">{t("m_eb0f72fb6f")} {issue.index}</a></div></li>)}</ul>}{report.warnings.length>0&&<details><summary>{t("m_e510f14bcc")} {report.warnings.length}  {t("m_49ccde43a1")}</summary><ul>{report.warnings.map((x,i)=><li key={i}>{x}{onFix&&<button className="text-link" onClick={()=>onFix(x.includes(t("m_515559957f"))?'category':x.includes(t("m_21c04b2eee"))?'summary':'content')}>{t("m_baea2630d8")}</button>}</li>)}</ul></details>}{passed&&<p>{t("m_4878feba56")}{publishLabel.includes(t("m_948c5c16d8"))?t("m_034829aca8"):t("m_b61f333b91")}。</p>}</>}
  </div></div>
  <div className="article-preview-label"><h2>{t("m_255536cdc5")}</h2><p>{t("m_0b251f0ddf")}</p></div>
  {previewFailed&&!root&&<div role="alert" className="article-review-result"><div><p>{t("m_60318136e2")}</p><button className="article-button" onClick={()=>{setPreviewFailed(false);setPreviewAttempt(value=>value+1);}}>{t("m_2b4d78b18e")}</button></div></div>}
  <div className="article-review-scroll"><iframe key={previewAttempt} title={t("m_9605a825d8")} ref={frame} srcDoc={srcDoc} sandbox="allow-same-origin" onLoad={ready} style={{width,height:620}}/>{root&&createPortal(<EmbeddedPlayback.Provider value={false}>{preview}</EmbeddedPlayback.Provider>,root)}</div>
  <div className="article-review-footer"><p>{checking?t("m_0c43f7c878"):!current?t("m_a4b9723613"):!passed?t("m_fb51df09db"):publishLabel.includes(t("m_948c5c16d8"))?t("m_96d9b4b130"):t("m_e30d99d65d")}</p><button className="article-review-publish article-button article-button-primary" disabled={disabled||busy||checking||!passed} onClick={onPublish}>{busy?t("m_6bdb443509"):publishLabel}</button></div>
 </section>;
}
