import {useState} from 'react';
import {Link} from 'react-router-dom';
import {useResource} from './ContentUI';
import '../../styles/blog-foundation.css';
export function ArticleDiscovery({id,title}:{id:number;title:string}){
 const {data,error,reload}=useResource(`/posts/${id}/discovery`);const [message,setMessage]=useState(''),[fallback,setFallback]=useState(false);
 const url=new URL(`/article/${id}`,window.location.origin).href;
 async function copy(){try{await navigator.clipboard.writeText(url);setFallback(false);setMessage('链接已复制');}catch{setFallback(true);setMessage('请手动复制下面的链接');}}
 async function share(){try{await navigator.share({title,url});}catch(e){if((e as Error).name!=='AbortError'){setFallback(true);setMessage('分享失败，请复制链接');}}}
 return <section className="article-discovery" aria-label="继续阅读与分享">
 <div className="inline-actions"><button className="quiet-button" onClick={()=>void copy()}>复制链接</button>{typeof navigator.share==='function'&&<button className="quiet-button" onClick={()=>void share()}>分享</button>}<span role="status">{message}</span></div>
 {fallback&&<input className="share-fallback" aria-label="文章链接" readOnly value={url} onFocus={e=>e.target.select()}/>}
 {error&&<button className="text-link" onClick={reload}>文章导航加载失败，重试</button>}
 {data&&<><nav className="article-neighbors" aria-label="相邻文章">{[['previous','上一篇'],['next','下一篇']].map(([key,label])=>data[key]?<Link key={key} to={`/article/${data[key].id}`}><small>{label}</small><span>{data[key].title}</span></Link>:<span key={key}/>)}</nav>
 {!!data.related?.length&&<section><h2>相关文章</h2><ul>{data.related.map((p:any)=><li key={p.id}><Link to={`/article/${p.id}`}>{p.title}</Link></li>)}</ul></section>}</>}
 </section>;
}
