import { useI18n } from '../i18n';
import { notify } from '../lib/feedback';
import {ThemeSelect} from '../components/ThemeSelect';
import {useEngagement} from '../lib/useEngagement';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../components/ui/dialog';
import {useEffect,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Link} from '../components/LocaleLink';
import {Bookmark} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {api} from '../lib/api';
import {Pagination,ContentSkeleton,PageData} from '../components/ContentUI';
import {BlogCard} from '../components/BlogCard';
import '../../styles/blog-foundation.css';
export default function BookmarksPage(){const {user}=useAuth();return <MyBookmarks key={user?.id}/>;}
function MyBookmarks(){
  const { t } = useI18n();
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
 return <section className="account-bookmarks"><header className="account-page-heading"><div><span className="account-eyebrow">{t("m_0bdc4be3c9")}</span><h1>{t("m_9385bfefca")}</h1><p>{t("m_0d575bccac")}</p></div></header>
 {enhanced&&<><div className="engagement-toolbar"><label>{t("m_796d20e915")}<ThemeSelect allowEmpty aria-label={t("m_796d20e915")} value={folder} onValueChange={v=>{setFolder(v);setParams({page:'1'});}}><option value="">{t("m_51b6a2cf99")}</option>{folders.map(f=><option key={f.id} value={String(f.id)}>{f.name}（{f.total}）</option>)}</ThemeSelect></label><label>{t("m_44ce7ae909")}<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("m_2ea1fbc15d")}/></label></div><div className="engagement-folder-tools"><button className="engagement-button" onClick={()=>{setActionError('');setFolderName('');setDialog('create');}}>{t("m_fdf0b569d8")}</button>{Number(folder)>0&&<><button className="engagement-button" onClick={()=>{setFolderName(folders.find(f=>String(f.id)===folder)?.name||'');setDialog('rename');}}>{t("m_0d0cbac2ee")}</button><button className="engagement-button" onClick={()=>setDialog('delete')}>{t("m_920fe6ef05")}</button></>}</div></>}
 <Dialog open={!!dialog} onOpenChange={open=>{if(!open&&!folderBusy)setDialog(null);}}><DialogContent className="workspace-form-dialog"><DialogTitle>{dialog==='create'?t("m_fdf0b569d8"):dialog==='rename'?t("m_a8d2648ee9"):t("m_880df234e2")}</DialogTitle><DialogDescription>{dialog==='delete'?t("m_ae3b74b814"):t("m_a614811f6a")}</DialogDescription>{dialog!=='delete'&&<label>{t("m_b161b3f76a")}<input value={folderName} maxLength={60} onChange={e=>setFolderName(e.target.value)}/></label>}{actionError&&<p role="alert">{actionError}</p>}<button data-dialog-cancel={dialog==='delete'?true:undefined} disabled={folderBusy} onClick={()=>setDialog(null)}>{t("m_2cd0f3be87")}</button><button className="account-primary-button" disabled={folderBusy||(dialog!=='delete'&&!folderName.trim())} onClick={()=>void folderAction()}>{t("m_36f33adaf0")}{dialog==='delete'?t("m_2f9daa8289"):t("m_a3030bf8f1")}</button></DialogContent></Dialog>
 {(error||actionError)&&<p role="alert">{t(actionError||error)} <button className="text-link" onClick={()=>setTick(n=>n+1)}>{t("m_b8784c8dd5")}</button></p>}
 {loading&&!data?<ContentSkeleton/>:data&&<><div className="bookmark-list" aria-busy={busy!==null}>
 {!data.items.length&&<div className="account-bookmark-empty"><span className="account-bookmark-symbol"><Bookmark size={26} aria-hidden="true"/></span><h2>{query?t("m_2bac8256cd"):folder!==''?t("m_38b45355c5"):t("m_fad075403f")}</h2><p>{query?t("m_db8a48a124"):t("m_69886c34cf")}</p>{query||folder!==''?<button className="account-primary-button" onClick={()=>{setSearch('');setQuery('');setFolder('');setParams({page:'1'});}}>{t("m_6f7d74fc25")}</button>:<Link className="account-primary-button" to="/articles">{t("m_b1e75f178e")}</Link>}</div>}
 {data.items.map(p=><section className="bookmark-item" key={p.id}>{p.available?<BlogCard id={p.post_id} slug={p.slug} title={p.title} excerpt={p.summary||''} image={p.cover_image||''} coverCrop={p.cover_crop} category={p.category} tags={p.tags||[]} date={p.updated_at||p.published_at} dateLabel={t("m_7153f0918a")}/>:<div className="quiet-state"><Bookmark size={20} aria-hidden="true"/><p>{t("m_82dcf22bd4")}</p></div>}<>{enhanced&&<label className="bookmark-move">{t("m_fbb91840f0")}<ThemeSelect aria-label={t("m_598a05352b")+(p.title||t("m_82dcf22bd4"))} disabled={busy!==null} value={String(p.folder_id||0)} onValueChange={v=>void move(p.post_id,v)}>{folders.map(f=><option key={f.id} value={String(f.id)}>{f.name}</option>)}</ThemeSelect></label>}<button className="text-link" disabled={busy!==null} onClick={()=>void remove(p.post_id)} aria-label={p.available?t("m_b01700e4a4", {v0: p.title}):t("m_28a09b6ccb")}>{busy===p.post_id?t("m_e8e08b0f61"):t("m_dca60869e7")}</button></></section>)}
 </div>{data.total>data.pageSize&&<Pagination data={data} onPage={p=>setParams({page:String(p)})}/>}</>}
 </section>;
}
