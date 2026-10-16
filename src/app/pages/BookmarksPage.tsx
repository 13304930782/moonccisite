import { notify } from '../lib/feedback';
import {ThemeSelect} from '../components/ThemeSelect';
import {useEngagement} from '../lib/useEngagement';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../components/ui/dialog';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {Bookmark} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {api} from '../lib/api';
import {Pagination,ContentSkeleton,PageData} from '../components/ContentUI';
import {BlogCard} from '../components/BlogCard';
import '../../styles/blog-foundation.css';
export default function BookmarksPage(){const {user}=useAuth();return <MyBookmarks key={user?.id}/>;}
function MyBookmarks(){
 const enhanced=useEngagement(),[params,setParams]=useSearchParams();
 const folder=params.get('folder')||'',query=params.get('search')||'',page=/^[1-9]\d*$/.test(params.get('page')||'')?Number(params.get('page')):1;
 const [folders,setFolders]=useState<any[]>([]),[search,setSearch]=useState(query),[composing,setComposing]=useState(false),[dialog,setDialog]=useState<'create'|'rename'|'delete'|null>(null),[folderName,setFolderName]=useState(''),[folderBusy,setFolderBusy]=useState(false);
 const [data,setData]=useState<PageData|null>(null),[error,setError]=useState(''),[actionError,setActionError]=useState(''),[busy,setBusy]=useState<{id:number;type:'remove'|'move'}|null>(null),[tick,setTick]=useState(0),[loading,setLoading]=useState(true);
 const request=useRef(0),folderRequest=useRef(0),controller=useRef<AbortController|null>(null),mounted=useRef(true),writeLock=useRef(false),list=useRef<HTMLDivElement>(null),focusAfterRemove=useRef(false),currentFolder=useRef(folder);currentFolder.current=folder;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current++;folderRequest.current++;controller.current?.abort();};},[]);
 const changeParams=useCallback((values:Record<string,string>,replace=false)=>setParams(current=>{const next=new URLSearchParams(current);for(const [key,value]of Object.entries(values)){if(value)next.set(key,value);else next.delete(key);}return next;},{replace}),[setParams]);
 const loadFolders=useCallback(async()=>{const id=++folderRequest.current;try{const result=await api('/bookmark-folders',{cache:'no-store'});if(mounted.current&&id===folderRequest.current)setFolders(result.items);}catch(e:any){if(mounted.current&&id===folderRequest.current)setActionError(e.message);}},[]);
 useEffect(()=>{if(enhanced)void loadFolders();},[enhanced,loadFolders]);
 useEffect(()=>setSearch(query),[query]);
 useEffect(()=>{if(composing||search===query)return;const timer=setTimeout(()=>changeParams({search,page:''},true),300);return()=>clearTimeout(timer);},[search,query,composing,changeParams]);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible'&&!writeLock.current){setTick(n=>n+1);if(enhanced)void loadFolders();}};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[enhanced,loadFolders]);
 useEffect(()=>{
  const id=++request.current,c=new AbortController();controller.current?.abort();controller.current=c;setLoading(true);setError('');
  api(`/bookmarks?page=${page}`+(enhanced?'&search='+encodeURIComponent(query)+(folder!==''?'&folder='+encodeURIComponent(folder):''):''),{signal:c.signal,cache:'no-store'}).then(r=>{if(c.signal.aborted||id!==request.current)return;if(r.page!==page)changeParams({page:r.page===1?'':String(r.page)},true);else setData(r);}).catch(e=>{if(!c.signal.aborted&&id===request.current)setError(e.message);}).finally(()=>{if(!c.signal.aborted&&id===request.current)setLoading(false);});
  return()=>c.abort();
 },[page,tick,enhanced,folder,query,changeParams]);
 useEffect(()=>{if(focusAfterRemove.current){focusAfterRemove.current=false;list.current?.focus({preventScroll:true});}},[data]);
 const refreshList=()=>{request.current++;controller.current?.abort();setTick(n=>n+1);};
 const folderAction=async()=>{
  if(writeLock.current)return;writeLock.current=true;setFolderBusy(true);setActionError('');
  try{if(dialog==='create')await api('/bookmark-folders',{method:'POST',body:JSON.stringify({name:folderName})});else if(dialog==='rename')await api('/bookmark-folders/'+folder,{method:'PUT',body:JSON.stringify({name:folderName})});else await api('/bookmark-folders/'+folder,{method:'DELETE'});
   if(!mounted.current)return;if(dialog==='delete'&&currentFolder.current===folder)changeParams({folder:'',page:''});setDialog(null);void loadFolders();refreshList();notify.success(dialog==='delete'?'收藏夹已删除，文章已移回默认收藏夹。':'收藏夹已保存。');
  }catch(e:any){if(mounted.current){setActionError(e.message);notify.error(e.message);}}
  finally{writeLock.current=false;if(mounted.current)setFolderBusy(false);}
 };
 const move=async(postId:number,value:string)=>{
  if(writeLock.current)return;writeLock.current=true;setBusy({id:postId,type:'move'});setActionError('');
  try{await api('/bookmark-folders/move/'+postId,{method:'PUT',body:JSON.stringify({folder_id:Number(value)})});if(!mounted.current)return;void loadFolders();refreshList();notify.success('已移至所选收藏夹。');}
  catch(e:any){if(mounted.current){setActionError(e.message);notify.error(e.message);}}
  finally{writeLock.current=false;if(mounted.current)setBusy(null);}
 };
 async function remove(id:number,trigger:HTMLButtonElement){
  if(writeLock.current)return;writeLock.current=true;setBusy({id,type:'remove'});setActionError('');
  try{await api(`/bookmarks/${id}`,{method:'DELETE'});if(!mounted.current)return;focusAfterRemove.current=document.activeElement===trigger;setData(current=>current?{...current,items:current.items.filter(p=>p.post_id!==id),total:current.total-(current.items.some(p=>p.post_id===id)?1:0)}:current);if(enhanced)void loadFolders();refreshList();notify.success('已取消收藏。');}
  catch(e:any){if(mounted.current){setActionError(e.message);notify.error(e.message);}}
  finally{writeLock.current=false;if(mounted.current)setBusy(null);}
 }
 return <section className="account-bookmarks"><header className="account-page-heading"><div><span className="account-eyebrow">阅读收藏</span><h1>我的收藏</h1><p>把值得重读的文章留在这里，仅自己可见。</p></div></header>
 {enhanced&&<><div className="engagement-toolbar"><label>收藏夹<ThemeSelect allowEmpty aria-label="收藏夹" value={folder} onValueChange={v=>changeParams({folder:v,page:''})}><option value="">全部收藏</option>{folders.map(f=><option key={f.id} value={String(f.id)}>{f.name}（{f.total}）</option>)}</ThemeSelect></label><label>搜索<input type="search" value={search} onCompositionStart={()=>setComposing(true)} onCompositionEnd={e=>{setComposing(false);setSearch(e.currentTarget.value);}} onChange={e=>setSearch(e.target.value)} placeholder="搜索文章标题"/></label></div><div className="engagement-folder-tools"><button className="engagement-button" disabled={folderBusy||busy!==null} onClick={()=>{setActionError('');setFolderName('');setDialog('create');}}>新建收藏夹</button>{Number(folder)>0&&<><button className="engagement-button" disabled={folderBusy||busy!==null} onClick={()=>{setActionError('');setFolderName(folders.find(f=>String(f.id)===folder)?.name||'');setDialog('rename');}}>重命名</button><button className="engagement-button" disabled={folderBusy||busy!==null} onClick={()=>{setActionError('');setDialog('delete');}}>删除收藏夹</button></>}</div></>}
 <Dialog open={!!dialog} onOpenChange={open=>{if(!open&&!writeLock.current)setDialog(null);}}><DialogContent className="workspace-form-dialog"><DialogTitle>{dialog==='create'?'新建收藏夹':dialog==='rename'?'重命名收藏夹':'删除收藏夹？'}</DialogTitle><DialogDescription>{dialog==='delete'?'其中的文章会移回默认收藏夹，不会取消收藏。':'收藏夹仅自己可见。'}</DialogDescription>{dialog!=='delete'&&<label>收藏夹名称<input disabled={folderBusy} value={folderName} maxLength={60} onChange={e=>setFolderName(e.target.value)}/></label>}{actionError&&<p role="alert">{actionError}</p>}<button data-dialog-cancel={dialog==='delete'?true:undefined} disabled={folderBusy} onClick={()=>setDialog(null)}>取消</button><button className="account-primary-button" aria-busy={folderBusy} disabled={folderBusy||(dialog!=='delete'&&!folderName.trim())} onClick={()=>void folderAction()}>确认{dialog==='delete'?'删除':'保存'}</button></DialogContent></Dialog>
 {(error||actionError)&&!dialog&&<p role="alert">{actionError||error} <button className="text-link" disabled={loading} onClick={()=>{setActionError('');setTick(n=>n+1);if(enhanced)void loadFolders();}}>重新加载收藏</button></p>}
 {loading&&!data?<ContentSkeleton/>:data&&<><div className="bookmark-list" ref={list} tabIndex={-1} aria-label="收藏列表" aria-busy={loading||busy!==null}>{loading&&<p role="status" className="resource-notice">正在更新收藏，当前内容仍可查看。</p>}
 {!data.items.length&&<div className="account-bookmark-empty"><span className="account-bookmark-symbol"><Bookmark size={26} aria-hidden="true"/></span><h2>{query?'没有找到匹配的文章':folder!==''?'这个收藏夹还是空的':'还没有收藏文章'}</h2><p>{query?'换个关键词，或清空搜索查看全部收藏。':'阅读时点击收藏，喜欢的文章就会保存在这里。'}</p>{query||folder!==''?<button className="account-primary-button" onClick={()=>{setSearch('');changeParams({search:'',folder:'',page:''});}}>清除筛选，查看全部收藏</button>:<Link className="account-primary-button" to="/articles">去看看文章 →</Link>}</div>}
 {data.items.map(p=><section className="bookmark-item" key={p.id}>{p.available?<BlogCard id={p.post_id} title={p.title} excerpt={p.summary||''} image={p.cover_image||''} coverCrop={p.cover_crop} category={p.category} tags={p.tags||[]} date={p.updated_at||p.published_at} dateLabel="更新于"/>:<div className="quiet-state"><Bookmark size={20} aria-hidden="true"/><p>文章暂不可用</p></div>}<>{enhanced&&<label className="bookmark-move">移至收藏夹<ThemeSelect aria-label={'移动收藏：'+(p.title||'文章暂不可用')} disabled={folderBusy||busy!==null} value={String(p.folder_id||0)} onValueChange={v=>void move(p.post_id,v)}>{folders.map(f=><option key={f.id} value={String(f.id)}>{f.name}</option>)}</ThemeSelect></label>}<button className="text-link" disabled={folderBusy||busy!==null} aria-busy={busy?.id===p.post_id} onClick={event=>void remove(p.post_id,event.currentTarget)} aria-label={p.available?`取消收藏：${p.title}`:'取消收藏：文章暂不可用'}>{busy?.id===p.post_id?(busy?.type==='remove'?'正在取消…':'正在移动…'):'取消收藏'}</button></></section>)}
 </div>{data.total>data.pageSize&&<Pagination data={data} onPage={p=>changeParams({page:p===1?'':String(p)})}/>}</>}
 </section>;
}
