import {ContentTranslationEditor} from '../components/ContentTranslationEditor';
import { useI18n } from '../i18n';
import { useUnsavedLeave } from '../lib/useUnsavedLeave';
import { notify } from '../lib/feedback';
import { confirmAction } from '../lib/confirmAction';
import {useEffect,useState} from 'react';
import {ArticleMediaPicker} from '../components/ArticleMediaPicker';
import {safeImageSrc} from '../lib/safeUrl';
import '../../styles/article-workspace.css';
import {Library} from 'lucide-react';

import {Link} from '../components/LocaleLink';
import {api} from '../lib/api';
import '../../styles/publishing.css';
const blank={title:'',slug:'',description:'',cover_image:''};
export default function AdminSeriesPage(){
  const { t } = useI18n();
 const [items,setItems]=useState<any[]>([]),[form,setForm]=useState<any>(null),[posts,setPosts]=useState<any[]>([]),[postId,setPostId]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[matches,setMatches]=useState<any[]>([]),[searching,setSearching]=useState(false),[searched,setSearched]=useState(false),[mediaOpen,setMediaOpen]=useState(false),[saved,setSaved]=useState<{slug:string;visible:boolean}|null>(null);
 const [snapshot,setSnapshot]=useState('');
 const current=JSON.stringify({form,postIds:posts.map(post=>post.id)});
 const dirty=Boolean(form)&&current!==snapshot;
 useUnsavedLeave(dirty);
 async function cancel(){if(!dirty||await confirmAction(t("m_d87119f6cc"))){setForm(null);setError('');}}
 async function load(){setLoading(true);try{setItems((await api('/series?manage=true')).items);setError('');}catch(e:any){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 async function edit(item:any){setBusy(true);setError('');try{const r=await api('/series/manage/'+item.id+'/articles');setForm({...item});setPosts(r.items);setSnapshot(JSON.stringify({form:{...item},postIds:r.items.map((post:any)=>post.id)}));setMatches([]);setSearched(false);setPostId('');}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 async function save(){setBusy(true);setError('');try{const r=await api('/series'+(form.id?'/'+form.id:''),{method:form.id?'PUT':'POST',body:JSON.stringify(form)});const id=form.id||r.id;setForm({...form,id,slug:r.slug||form.slug});await api('/series/'+id+'/articles',{method:'PUT',body:JSON.stringify({post_ids:posts.map(p=>p.id)})});setSaved({slug:r.slug||form.slug,visible:posts.some(p=>p.status==='published')});setForm(null);await load();}catch(e:any){setError(e.message); notify.error(e.message);}finally{setBusy(false);}}
 async function search(){setSearching(true);setError('');try{const r=await api('/posts?search='+encodeURIComponent(postId.trim())+'&pageSize=20');setMatches(r.items||[]);setSearched(true);}catch(e:any){setError(e.message);}finally{setSearching(false);}}
 function add(post:any){setPosts(current=>current.some(p=>p.id===post.id)?current:[...current,post]);}

 function move(index:number,offset:number){setPosts(current=>{const result=[...current];[result[index],result[index+offset]]=[result[index+offset],result[index]];return result;});}
 return <section className="admin-page publishing-page series-admin-page"><header className="workspace-heading"><div><span className="workspace-eyebrow">{t("m_58ffbe8d7b")}</span><h1>{t("m_9b9471ee60")}</h1><p>{t("m_5d08bc590b")}</p></div><Link to="/series" className="series-public-link">{t("m_55dccd8f35")}</Link></header>
 {saved&&!form&&<p className="workspace-alert" role="status">{t("m_b69f49e49b")}{saved.visible?<Link to={'/series/'+saved.slug}>{t("m_55dccd8f35")}</Link>:t("m_6062c454ad")}</p>}
 {error&&<p role="alert">{t(error || '')}<button disabled={loading||busy} onClick={()=>void load()}>{t("m_a0d333de4b")}</button></p>}
 {loading?<p role="status">{t("m_21bd738e0d")}</p>:!form&&<><div className="series-list-toolbar"><h2>{t("m_904fc3fc09")} <small>{items.length}</small></h2><button disabled={busy} onClick={()=>{setForm({...blank});setPosts([]);setSnapshot(JSON.stringify({form:{...blank},postIds:[]}));setMatches([]);setSearched(false);setPostId('');}}>{t("m_5b8cfc3d9f")}</button></div>{!error&&!items.length&&<div className="queue-panel workspace-empty"><span className="workspace-empty-icon"><Library size={26}/></span><h2>{t("m_dd61f97a8c")}</h2><p>{t("m_51e0301024")}</p></div>}<div className="publishing-list">{items.map(item=><article className="publishing-card" key={item.id}><h2>{item.title}</h2><p>{item.article_count}  {t("m_d4ba3a39f5")}</p><div className="publishing-actions"><button disabled={busy} onClick={()=>void edit(item)}>{t("m_e1a0c8c3fb")}</button><button disabled={busy} onClick={async()=>{if(!(await confirmAction(t("m_82605aa4de"))))return;setBusy(true);try{await api('/series/'+item.id,{method:'DELETE'});await load();}catch(e:any){setError(e.message); notify.error(e.message);}finally{setBusy(false);}}}>{t("m_f411a3389c")}</button></div></article>)}</div></>}
 {form?.id&&<ContentTranslationEditor type="series" id={form.id} source={form}/>}
 {form&&<form className="publishing-card" onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy}>
 <label>{t("m_d44e9b3d3b")}<input required maxLength={255} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
 <details><summary>{t("m_065de0ddab")}</summary><p>{t("m_3a0d88e76b")}</p><label>{t("m_8088f4714e")}<input pattern="[a-z0-9][a-z0-9-]*" maxLength={191} value={form.slug} onChange={e=>setForm({...form,slug:e.target.value})}/></label></details>
 <label>{t("m_8131eafd02")}<textarea maxLength={10000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
 <div><h2>{t("m_6b8f7bab53")}</h2>{safeImageSrc(form.cover_image)&&<img src={safeImageSrc(form.cover_image)} alt={t("m_5af2e1616b")} style={{width:'100%',maxHeight:180,objectFit:'cover',borderRadius:12}}/>}<button type="button" onClick={()=>setMediaOpen(true)}>{form.cover_image?t("m_0349bb70de"):t("m_80d74aba4b")}</button>{form.cover_image&&<button type="button" onClick={()=>setForm({...form,cover_image:''})}>{t("m_de2e34c35f")}</button>}</div>
 <h2 className="series-order-heading">{t("m_cdc653ee43")}</h2><p>{t("m_1b7a6d443c")}</p>
 <label>{t("m_f2ea029271")}<input type="search" placeholder={t("m_3ae86dfa86")} value={postId} onChange={e=>{setPostId(e.target.value);setSearched(false);setMatches([]);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void search();}}}/></label><button type="button" disabled={searching} onClick={()=>void search()}>{searching?t("m_1986994f30"):t("m_f2ea029271")}</button>
 {searched&&<div className="series-search-results" role="region" aria-label={t("m_c2c227c041")}>{!matches.length?<p>{t("m_a0108ff126")}</p>:<><p>{t("m_45d760708b")}</p>{matches.map(post=><div className="series-search-row" key={post.id}><span>{post.title}</span><button type="button" disabled={posts.some(p=>p.id===post.id)} onClick={()=>add(post)}>{posts.some(p=>p.id===post.id)?t("m_889839915c"):t("m_059eec6512")}</button></div>)}</>}</div>}
 <ol>{posts.map((post,index)=><li key={post.id}>{post.title}（{post.status==='published'?t("m_d334724d6b"):t("m_abcd7f6085")}）<button type="button" aria-label={t("m_f853a70b12")+post.title} disabled={index===0} onClick={()=>move(index,-1)}>{t("m_f853a70b12")}</button><button type="button" aria-label={t("m_e75e8b4e5c")+post.title} disabled={index===posts.length-1} onClick={()=>move(index,1)}>{t("m_e75e8b4e5c")}</button><button type="button" onClick={()=>setPosts(p=>p.filter(x=>x.id!==post.id))}>{t("m_95861c4b5c")}</button></li>)}</ol>
 <div className="publishing-actions"><button type="submit">{t("m_731a847cc1")}</button><button type="button" onClick={()=>void cancel()}>{t("m_4b29ce8e40")}</button></div></fieldset></form>}{mediaOpen&&<ArticleMediaPicker onClose={()=>setMediaOpen(false)} onSelect={url=>setForm((current:any)=>current?{...current,cover_image:url}:current)}/>}</section>;
}
