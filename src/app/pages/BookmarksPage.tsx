import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {Bookmark} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {api} from '../lib/api';
import {SitePage,PageHeading,Pagination,ContentSkeleton,PageData} from '../components/ContentUI';
import {BlogCard} from '../components/BlogCard';
import '../../styles/blog-foundation.css';
export default function BookmarksPage(){const {user}=useAuth();return <MyBookmarks key={user?.id}/>;}
function MyBookmarks(){
 const [params,setParams]=useSearchParams();const page=/^[1-9]\d*$/.test(params.get('page')||'')?Number(params.get('page')):1;
 const [data,setData]=useState<PageData|null>(null),[error,setError]=useState(''),[actionError,setActionError]=useState(''),[busy,setBusy]=useState<number|null>(null),[tick,setTick]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')setTick(n=>n+1);};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[]);
 useEffect(()=>{
  if(busy!==null)return;const c=new AbortController();setLoading(true);setError('');setData(null);
  api(`/bookmarks?page=${page}`,{signal:c.signal,cache:'no-store'}).then(r=>{if(c.signal.aborted)return;if(r.page!==page)setParams({page:String(r.page)},{replace:true});else setData(r);}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});
  return()=>c.abort();
 },[page,tick,busy,setParams]);
 async function remove(id:number){if(busy!==null)return;setBusy(id);setActionError('');try{await api(`/bookmarks/${id}`,{method:'DELETE'});}catch(e:any){setActionError(e.message);}finally{setBusy(null);}}
 return <SitePage><PageHeading eyebrow="SAVED FOR LATER" title="我的收藏"><p>只有你能看到这里的文章。</p><Link className="text-link" to="/account/settings">返回个人设置</Link></PageHeading>
 {(error||actionError)&&<p role="alert">{actionError||error} <button className="text-link" onClick={()=>setTick(n=>n+1)}>重试</button></p>}
 {loading&&!data?<ContentSkeleton/>:data&&<><div className="bookmark-list" aria-busy={busy!==null}>
 {!data.items.length&&<div className="quiet-state"><Bookmark size={24} aria-hidden="true"/><p>还没有收藏文章。</p><Link className="text-link" to="/articles">去看看文章</Link></div>}
 {data.items.map(p=><section className="bookmark-item" key={p.id}>{p.available?<BlogCard id={p.post_id} title={p.title} excerpt={p.summary||''} image={p.cover_image||''} category={p.category} tags={p.tags||[]} date={p.updated_at||p.published_at} dateLabel="更新于"/>:<div className="quiet-state"><Bookmark size={20} aria-hidden="true"/><p>文章暂不可用</p></div>}<button className="text-link" disabled={busy!==null} onClick={()=>void remove(p.post_id)} aria-label={p.available?`取消收藏：${p.title}`:'取消收藏：文章暂不可用'}>{busy===p.post_id?'正在取消…':'取消收藏'}</button></section>)}
 </div>{data.total>0&&<Pagination data={data} onPage={p=>setParams({page:String(p)})}/>}</>}
 </SitePage>;
}
