import { notify } from '../lib/feedback';
import {ThemeSelect} from '../components/ThemeSelect';
import {useEngagement} from '../lib/useEngagement';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../components/ui/dialog';
import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {Bookmark} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {api} from '../lib/api';
import {Pagination,ContentSkeleton,PageData} from '../components/ContentUI';
import {BlogCard} from '../components/BlogCard';
import '../../styles/blog-foundation.css';
export default function BookmarksPage(){const {user}=useAuth();return <MyBookmarks key={user?.id}/>;}
function MyBookmarks(){
 const enhanced=useEngagement(),[folders,setFolders]=useState<any[]>([]),[folder,setFolder]=useState(''),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[dialog,setDialog]=useState<'create'|'rename'|'delete'|null>(null),[folderName,setFolderName]=useState(''),[folderBusy,setFolderBusy]=useState(false);
 const loadFolders=()=>api('/bookmark-folders').then(r=>setFolders(r.items)).catch(e=>setActionError(e.message));
 useEffect(()=>{if(enhanced)void loadFolders();},[enhanced]);
 useEffect(()=>{if(search===query)return;const timer=setTimeout(()=>{setQuery(search);setParams({page:'1'});},300);return()=>clearTimeout(timer);},[search]);
 const folderAction=async()=>{setFolderBusy(true);setActionError('');try{if(dialog==='create')await api('/bookmark-folders',{method:'POST',body:JSON.stringify({name:folderName})});else if(dialog==='rename')await api('/bookmark-folders/'+folder,{method:'PUT',body:JSON.stringify({name:folderName})});else{await api('/bookmark-folders/'+folder,{method:'DELETE'});setFolder('');}await loadFolders();setDialog(null);setTick(n=>n+1);}catch(e:any){setActionError(e.message); notify.error(e.message);}finally{setFolderBusy(false);}};
 const move=async(postId:number,value:string)=>{setBusy(postId);try{await api('/bookmark-folders/move/'+postId,{method:'PUT',body:JSON.stringify({folder_id:Number(value)})});await loadFolders();}catch(e:any){setActionError(e.message); notify.error(e.message);}finally{setBusy(null);}};

 const [params,setParams]=useSearchParams();const page=/^[1-9]\d*$/.test(params.get('page')||'')?Number(params.get('page')):1;
 const [data,setData]=useState<PageData|null>(null),[error,setError]=useState(''),[actionError,setActionError]=useState(''),[busy,setBusy]=useState<number|null>(null),[tick,setTick]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')setTick(n=>n+1);};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[]);
 useEffect(()=>{
  if(busy!==null)return;const c=new AbortController();setLoading(true);setError('');setData(null);
  api(`/bookmarks?page=${page}`+(enhanced?'&search='+encodeURIComponent(query)+(folder!==''?'&folder='+folder:''):''),{signal:c.signal,cache:'no-store'}).then(r=>{if(c.signal.aborted)return;if(r.page!==page)setParams({page:String(r.page)},{replace:true});else setData(r);}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});
  return()=>c.abort();
 },[page,tick,busy,setParams,enhanced,folder,query]);
 async function remove(id:number){if(busy!==null)return;setBusy(id);setActionError('');try{await api(`/bookmarks/${id}`,{method:'DELETE'});if(enhanced)await loadFolders();}catch(e:any){setActionError(e.message); notify.error(e.message);}finally{setBusy(null);}}
 return <section className="account-bookmarks"><header className="account-page-heading"><div><span className="account-eyebrow">阅读收藏</span><h1>我的收藏</h1><p>把值得重读的文章留在这里，仅自己可见。</p></div></header>
 {enhanced&&<><div className="engagement-toolbar"><label>收藏夹<ThemeSelect allowEmpty aria-label="收藏夹" value={folder} onValueChange={v=>{setFolder(v);setParams({page:'1'});}}><option value="">全部收藏</option>{folders.map(f=><option key={f.id} value={String(f.id)}>{f.name}（{f.total}）</option>)}</ThemeSelect></label><label>搜索<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索文章标题"/></label></div><div className="engagement-folder-tools"><button className="engagement-button" onClick={()=>{setActionError('');setFolderName('');setDialog('create');}}>新建收藏夹</button>{Number(folder)>0&&<><button className="engagement-button" onClick={()=>{setFolderName(folders.find(f=>String(f.id)===folder)?.name||'');setDialog('rename');}}>重命名</button><button className="engagement-button" onClick={()=>setDialog('delete')}>删除收藏夹</button></>}</div></>}
 <Dialog open={!!dialog} onOpenChange={open=>{if(!open&&!folderBusy)setDialog(null);}}><DialogContent className="workspace-form-dialog"><DialogTitle>{dialog==='create'?'新建收藏夹':dialog==='rename'?'重命名收藏夹':'删除收藏夹？'}</DialogTitle><DialogDescription>{dialog==='delete'?'其中的文章会移回默认收藏夹，不会取消收藏。':'收藏夹仅自己可见。'}</DialogDescription>{dialog!=='delete'&&<label>收藏夹名称<input value={folderName} maxLength={60} onChange={e=>setFolderName(e.target.value)}/></label>}{actionError&&<p role="alert">{actionError}</p>}<button data-dialog-cancel={dialog==='delete'?true:undefined} disabled={folderBusy} onClick={()=>setDialog(null)}>取消</button><button className="account-primary-button" disabled={folderBusy||(dialog!=='delete'&&!folderName.trim())} onClick={()=>void folderAction()}>确认{dialog==='delete'?'删除':'保存'}</button></DialogContent></Dialog>
 {(error||actionError)&&<p role="alert">{actionError||error} <button className="text-link" onClick={()=>setTick(n=>n+1)}>重试</button></p>}
 {loading&&!data?<ContentSkeleton/>:data&&<><div className="bookmark-list" aria-busy={busy!==null}>
 {!data.items.length&&<div className="account-bookmark-empty"><span className="account-bookmark-symbol"><Bookmark size={26} aria-hidden="true"/></span><h2>{query?'没有找到匹配的文章':folder!==''?'这个收藏夹还是空的':'还没有收藏文章'}</h2><p>{query?'换个关键词，或清空搜索查看全部收藏。':'阅读时点击收藏，喜欢的文章就会保存在这里。'}</p>{query||folder!==''?<button className="account-primary-button" onClick={()=>{setSearch('');setQuery('');setFolder('');setParams({page:'1'});}}>清除筛选，查看全部收藏</button>:<Link className="account-primary-button" to="/articles">去看看文章 →</Link>}</div>}
 {data.items.map(p=><section className="bookmark-item" key={p.id}>{p.available?<BlogCard id={p.post_id} title={p.title} excerpt={p.summary||''} image={p.cover_image||''} category={p.category} tags={p.tags||[]} date={p.updated_at||p.published_at} dateLabel="更新于"/>:<div className="quiet-state"><Bookmark size={20} aria-hidden="true"/><p>文章暂不可用</p></div>}<>{enhanced&&<label className="bookmark-move">移至收藏夹<ThemeSelect aria-label={'移动收藏：'+(p.title||'文章暂不可用')} disabled={busy!==null} value={String(p.folder_id||0)} onValueChange={v=>void move(p.post_id,v)}>{folders.map(f=><option key={f.id} value={String(f.id)}>{f.name}</option>)}</ThemeSelect></label>}<button className="text-link" disabled={busy!==null} onClick={()=>void remove(p.post_id)} aria-label={p.available?`取消收藏：${p.title}`:'取消收藏：文章暂不可用'}>{busy===p.post_id?'正在取消…':'取消收藏'}</button></></section>)}
 </div>{data.total>data.pageSize&&<Pagination data={data} onPage={p=>setParams({page:String(p)})}/>}</>}
 </section>;
}
