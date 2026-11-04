import { useLocale } from '../context/LocaleContext';
import { useI18n } from '../i18n';
import { articlePath } from '../lib/articleUrl';
import { notify } from '../lib/feedback';
import {BookmarkButton} from './BookmarkButton';
import {useState,useEffect} from 'react';

import {Link} from './LocaleLink';
import {useResource} from './ContentUI';
import '../../styles/blog-foundation.css';
export function ArticleDiscovery({id,title,slug}:{id:number;title:string;slug?:string}){
  const { t } = useI18n();
  const { contentLocale } = useLocale();
 const {data,error,reload}=useResource(`/posts/${id}/discovery`);const [message,setMessage]=useState(''),[fallback,setFallback]=useState(false);
 const [canShare,setCanShare]=useState(false);
 useEffect(()=>setCanShare(typeof navigator.share==='function'),[]);
 const path=articlePath({id,slug}, contentLocale);
 const url=typeof window==='undefined'?path:new URL(path,window.location.origin).href;
 const neighbors=new Set([id,data?.previous?.id,data?.next?.id].filter(v=>v!=null).map(String));
 const related=(data?.related||[]).filter((post:any)=>!neighbors.has(String(post.id)));
 async function copy(){try{await navigator.clipboard.writeText(url);setFallback(false);notify.success(t("m_6ce7dfa5ec"));}catch{setFallback(true);setMessage(t("m_5444d3f03e")); notify.error(t("m_5444d3f03e"));}}
 async function share(){try{await navigator.share({title,url});}catch(e){if((e as Error).name!=='AbortError'){setFallback(true);setMessage(t("m_1099669434"));}}}
 return <section className="article-discovery" aria-label={t("m_9a725483d2")}>
 <div className="inline-actions"><BookmarkButton id={id} slug={slug}/><button className="quiet-button" onClick={()=>void copy()}>{t("m_8e86f9b1d5")}</button>{canShare&&<button className="quiet-button" onClick={()=>void share()}>{t("m_7e564575eb")}</button>}<span role="status">{t(message || '')}</span></div>
 {fallback&&<input className="share-fallback" aria-label={t("m_d75ef65602")} readOnly value={url} onFocus={e=>e.target.select()}/>}
 {error&&<button className="text-link" onClick={reload}>{t("m_dfa718ca73")}</button>}
 {data&&<><nav className="article-neighbors" aria-label={t("m_c922b8bc81")}>{[['previous',t("m_936698b800")],['next',t("m_fcfe139fc7")]].map(([key,label])=>data[key]?<Link key={key} to={articlePath(data[key])}><small>{label}</small><span>{data[key].title}</span></Link>:<span key={key}/>)}</nav>
 {!!related.length&&<section className="article-related"><h2>{t("m_9d06a8c871")}</h2><ul>{related.map((p:any)=><li key={p.id}><Link to={articlePath(p)}>{p.title}</Link></li>)}</ul></section>}</>}
 </section>;
}
