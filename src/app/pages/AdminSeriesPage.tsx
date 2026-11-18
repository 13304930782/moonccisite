import {ContentTranslationEditor} from '../components/ContentTranslationEditor';
import { useI18n } from '../i18n';
import { useUnsavedLeave } from '../lib/useUnsavedLeave';
import { confirmAction } from '../lib/confirmAction';
import {useEffect,useRef,useState} from 'react';
import {ArticleMediaPicker} from '../components/ArticleMediaPicker';
import {safeImageSrc} from '../lib/safeUrl';
import '../../styles/article-workspace.css';
import {ArrowDown,ArrowUp,Library,Plus} from 'lucide-react';
import {AdminButton} from '../components/admin/AdminButton';
import {StatusNotice} from '../components/ContentUI';
import '../../styles/admin-ui-v2.css';
import '../../styles/admin-series.css';

import {Link} from '../components/LocaleLink';
import {api} from '../lib/api';
import '../../styles/publishing.css';
const blank={title:'',slug:'',description:'',cover_image:''};
export default function AdminSeriesPage(){
  const { t } = useI18n();
 const [items,setItems]=useState<any[]>([]),[form,setForm]=useState<any>(null),[posts,setPosts]=useState<any[]>([]),[postId,setPostId]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[matches,setMatches]=useState<any[]>([]),[searching,setSearching]=useState(false),[searched,setSearched]=useState(false),[mediaOpen,setMediaOpen]=useState(false),[saved,setSaved]=useState<{slug:string;visible:boolean}|null>(null);
 const [snapshot,setSnapshot]=useState(''),[searchError,setSearchError]=useState(''),[translation,setTranslation]=useState({dirty:false,busy:false});
 const saving=useRef(false),leaving=useRef(false);
 const current=JSON.stringify({form,postIds:posts.map(post=>post.id)});
 const dirty=Boolean(form)&&current!==snapshot;
 useUnsavedLeave(dirty||translation.dirty);
 async function cancel(){if(busy||translation.busy||leaving.current)return;leaving.current=true;try{if(!dirty&&!translation.dirty||await confirmAction(t("m_d87119f6cc"))){setForm(null);setTranslation({dirty:false,busy:false});setError('');}}finally{leaving.current=false;}}
 async function load(){setLoading(true);try{setItems((await api('/series?manage=true')).items);setError('');}catch(e:any){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 async function edit(item:any){setBusy(true);setError('');try{const r=await api('/series/manage/'+item.id+'/articles');setForm({...item});setPosts(r.items);setSnapshot(JSON.stringify({form:{...item},postIds:r.items.map((post:any)=>post.id)}));setMatches([]);setSearched(false);setPostId('');setSearchError('');setSaved(null);setTranslation({dirty:false,busy:false});}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 async function save(){if(busy||translation.busy||saving.current)return;saving.current=true;try{if(translation.dirty&&!await confirmAction(t('m_a0731c0410')))return;setBusy(true);setError('');const r=await api('/series'+(form.id?'/'+form.id:''),{method:form.id?'PUT':'POST',body:JSON.stringify(form)});const id=form.id||r.id;setForm({...form,id,slug:r.slug||form.slug});await api('/series/'+id+'/articles',{method:'PUT',body:JSON.stringify({post_ids:posts.map(p=>p.id)})});setSaved({slug:r.slug||form.slug,visible:posts.some(p=>p.status==='published')});setForm(null);setTranslation({dirty:false,busy:false});await load();}catch(e:any){setError(e.message);}finally{saving.current=false;setBusy(false);}}
 async function search(){if(searching)return;setSearching(true);setSearchError('');try{const r=await api('/posts?search='+encodeURIComponent(postId.trim())+'&pageSize=20');setMatches(r.items||[]);setSearched(true);}catch(e:any){setSearchError(e.message);}finally{setSearching(false);}}
 function add(post:any){setPosts(current=>current.some(p=>p.id===post.id)?current:[...current,post]);}

 function move(index:number,offset:number){setPosts(current=>{const result=[...current];[result[index],result[index+offset]]=[result[index+offset],result[index]];return result;});}
 return <section className="admin-page publishing-page series-admin-page ui-v2">
  <header className="workspace-heading"><div><h1>{t("m_9b9471ee60")}</h1><p>{t("m_5d08bc590b")}</p></div><div className="series-heading-actions"><AdminButton asChild variant="soft"><Link to="/series">{t("m_55dccd8f35")}</Link></AdminButton>{!form&&<AdminButton type="button" disabled={busy||loading} onClick={()=>{setForm({...blank});setPosts([]);setSnapshot(JSON.stringify({form:{...blank},postIds:[]}));setMatches([]);setSearched(false);setPostId('');setSearchError('');setError('');setSaved(null);setTranslation({dirty:false,busy:false});}}><Plus size={16} aria-hidden="true"/>{t("m_5b8cfc3d9f")}</AdminButton>}</div></header>
  {saved&&!form&&<StatusNotice className="series-feedback">{t("m_b69f49e49b")} {saved.visible?<Link to={'/series/'+saved.slug}>{t("m_55dccd8f35")}</Link>:t("m_6062c454ad")}</StatusNotice>}
  {error&&!form&&<StatusNotice state="error" className="series-feedback" action={<AdminButton type="button" variant="soft" disabled={loading||busy} onClick={()=>void load()}>{t("m_a0d333de4b")}</AdminButton>}>{t(error)}</StatusNotice>}
  {loading&&!form?<StatusNotice state="loading">{t("m_21bd738e0d")}</StatusNotice>:!form&&<>
   <div className="series-list-toolbar"><h2>{t("m_904fc3fc09")}</h2><span>{t('共 {count} 项',{count:items.length})}</span></div>
   {!error&&!items.length&&<div className="queue-panel workspace-empty"><Library size={26} aria-hidden="true"/><h2>{t("m_dd61f97a8c")}</h2><p>{t("m_51e0301024")}</p></div>}
   {!!items.length&&<div className="series-list">{items.map(item=><article className="series-list-item" key={item.id}>
    {safeImageSrc(item.cover_image)&&<img className="series-list-cover" src={safeImageSrc(item.cover_image)} alt="" loading="lazy"/>}
    <div className="series-list-copy"><h2>{item.title}</h2>{item.description&&<p>{item.description}</p>}<small>{item.article_count} {t("m_d4ba3a39f5")}</small></div>
    <div className="series-item-actions"><AdminButton type="button" variant="soft" disabled={busy} onClick={()=>void edit(item)}>{t("m_e1a0c8c3fb")}</AdminButton><AdminButton type="button" variant="ghost" className="ui-btn--danger" disabled={busy} onClick={async()=>{if(!(await confirmAction(t("m_82605aa4de"))))return;setBusy(true);setSaved(null);try{await api('/series/'+item.id,{method:'DELETE'});await load();}catch(e:any){setError(e.message);}finally{setBusy(false);}}}>{t("m_f411a3389c")}</AdminButton></div>
   </article>)}</div>}
  </>}
  {form&&<form className="series-editor" onSubmit={e=>{e.preventDefault();void save();}} aria-busy={busy}>
   <div className="series-editor-heading"><h2>{t(form.id?'m_e1a0c8c3fb':'m_5b8cfc3d9f')}</h2></div>
   <fieldset className="series-editor-fields" disabled={busy||translation.busy}>
    <div className="series-basics"><div className="series-basic-fields">
     <label>{t("m_d44e9b3d3b")}<input required maxLength={255} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
     <label>{t("m_8131eafd02")}<textarea rows={3} maxLength={10000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
     <details className="series-slug"><summary>{t("m_065de0ddab")}</summary><p>{t("m_3a0d88e76b")}</p><label>{t("m_8088f4714e")}<input pattern="[a-z0-9][a-z0-9-]*" maxLength={191} value={form.slug} onChange={e=>setForm({...form,slug:e.target.value})}/></label></details>
    </div><section className="series-cover"><h3>{t("m_6b8f7bab53")}</h3>{safeImageSrc(form.cover_image)?<img src={safeImageSrc(form.cover_image)} alt={t("m_5af2e1616b")}/>:<div className="series-cover-empty"><Library size={28} aria-hidden="true"/><span>{t('未设置封面')}</span></div>}<div className="series-cover-actions"><AdminButton type="button" variant="soft" onClick={()=>setMediaOpen(true)}>{form.cover_image?t("m_0349bb70de"):t("m_80d74aba4b")}</AdminButton>{form.cover_image&&<AdminButton type="button" variant="ghost" onClick={()=>setForm({...form,cover_image:''})}>{t("m_de2e34c35f")}</AdminButton>}</div></section></div>
    <section className="series-articles"><h2>{t("m_cdc653ee43")}<span>{posts.length}</span></h2><p className="series-help">{t("m_1b7a6d443c")}</p>
     <div className="series-search"><label><span className="sr-only">{t("m_f2ea029271")}</span><input type="search" placeholder={t("m_3ae86dfa86")} value={postId} onChange={e=>{setPostId(e.target.value);setSearched(false);setMatches([]);setSearchError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void search();}}}/></label><AdminButton type="button" variant="soft" disabled={searching} onClick={()=>void search()}>{searching?t("m_1986994f30"):t("m_f2ea029271")}</AdminButton></div>
     {searchError&&<StatusNotice state="error">{t(searchError)}</StatusNotice>}
     {searched&&<div className="series-search-results" role="region" aria-label={t("m_c2c227c041")}>{!matches.length?<p>{t("m_a0108ff126")}</p>:<>{matches.map(post=><div className="series-search-row" key={post.id}><span>{post.title}</span><AdminButton type="button" variant="soft" disabled={posts.some(p=>p.id===post.id)} onClick={()=>add(post)}>{posts.some(p=>p.id===post.id)?t("m_889839915c"):t("m_059eec6512")}</AdminButton></div>)}</>}</div>}
     {posts.length?<ol className="series-ordered-list">{posts.map((post,index)=><li key={post.id}><span className="series-order-number" aria-hidden="true">{index+1}</span><div className="series-order-copy"><strong>{post.title}</strong><small>{post.status==='published'?t("m_d334724d6b"):t("m_abcd7f6085")}</small></div><div className="series-order-actions"><AdminButton type="button" variant="ghost" size="icon" aria-label={t("m_f853a70b12")+' '+post.title} disabled={index===0} onClick={()=>move(index,-1)}><ArrowUp size={16} aria-hidden="true"/></AdminButton><AdminButton type="button" variant="ghost" size="icon" aria-label={t("m_e75e8b4e5c")+' '+post.title} disabled={index===posts.length-1} onClick={()=>move(index,1)}><ArrowDown size={16} aria-hidden="true"/></AdminButton><AdminButton type="button" variant="ghost" aria-label={t("m_95861c4b5c")+' '+post.title} onClick={()=>setPosts(p=>p.filter(x=>x.id!==post.id))}>{t("m_95861c4b5c")}</AdminButton></div></li>)}</ol>:<p className="series-order-empty">{t('尚未添加文章。搜索并添加后，可调整阅读顺序。')}</p>}
    </section>
    <div className="series-save-area">{error&&<StatusNotice state="error">{t(error)}</StatusNotice>}<div className="series-save-actions"><AdminButton type="button" variant="soft" onClick={()=>void cancel()}>{t("m_4b29ce8e40")}</AdminButton><AdminButton type="submit">{busy?t("m_ff509c9ba0"):t("m_731a847cc1")}</AdminButton></div></div>
   </fieldset>
  </form>}
  {form?.id&&<fieldset className="series-translations" disabled={busy}><ContentTranslationEditor type="series" id={form.id} source={form} onStateChange={setTranslation}/></fieldset>}
  {mediaOpen&&<ArticleMediaPicker onClose={()=>setMediaOpen(false)} onSelect={url=>setForm((current:any)=>current?{...current,cover_image:url}:current)}/>}
 </section>;
}
