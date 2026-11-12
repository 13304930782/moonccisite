import { translate, useI18n } from '../i18n';
import {useNavigate} from 'react-router-dom';
import type {Locale} from './locale';
import { notify } from './feedback';
import {stripLegacyAgeNotice} from './articleAge';
import {useEffect,useRef,useState} from 'react';
import {api,ApiError} from './api';
import {readBackup,writeBackup,DraftBackup} from './draftStorage';
import {useUnsavedLeave} from './useUnsavedLeave';
import {draftSnapshot,settleDraftSave} from './articleDraftState';
export const emptyArticle={title:'',content:'',slug:'',summary:'',aside:'',cover_image:'',cover_crop:null,category:'',tags:[] as string[]};
export function useArticleDraft(userId:number,postId?:string,locale:Locale='zh-CN',enabled=true){
  const { t, locale: uiLocale } = useI18n();
 const navigate=useNavigate();
 const [slugBusy,setSlugBusy]=useState(false),[slugError,setSlugError]=useState('');const slugPending=useRef(false);
 const [summaryBusy,setSummaryBusy]=useState(false),[summaryError,setSummaryError]=useState('');const summaryPending=useRef(false);
 const statusText=(key:string, params?:Record<string,string|number>)=>translate('zh-CN',key,params);
 const [draft,setDraft]=useState<any>(null),[form,setForm]=useState<any>(emptyArticle),[status,setStatus]=useState('正在加载…'),[error,setError]=useState(''),[recovery,setRecovery]=useState<DraftBackup|null>(null),[busy,setBusy]=useState(false),[localAvailable,setLocalAvailable]=useState(true),[serverCopy,setServerCopy]=useState<any>(null);
 const [errorStatus,setErrorStatus]=useState(0);
 const current=useRef(form),saved=useRef(''),doc=useRef<any>(null),loading=useRef(true),blocked=useRef(false),pending=useRef<Promise<any>|null>(null),timer=useRef<ReturnType<typeof setTimeout>>(),changedAt=useRef(0),alive=useRef(true);
 const update=(input:any)=>{if(restoring.current)return;const value=typeof input==='function'?input(current.current):input;if(value.summary_mode==='manual'&&(value.summary!==current.current.summary||value.summary_mode!==current.current.summary_mode))setSummaryError('');if(value.slug!==current.current.slug)setSlugError('');current.current=value;setForm(value);changedAt.current ||= Date.now();setStatus(statusText("m_6a1be012c9"));};
 const backup=async(value:any,version:number)=>{if(!doc.current)return;try{await writeBackup({userId,locale,draftId:doc.current.id,payload:value,version,updatedAt:Date.now()});if(alive.current)setLocalAvailable(true);return true;}catch{if(alive.current)setLocalAvailable(false);return false;}};
 const apply=(d:any)=>{doc.current=d;setDraft(d);saved.current=draftSnapshot(d.payload);};
 const autoPaused=useRef(false);const restoring=useRef(false);const [isRestoring,setIsRestoring]=useState(false);
 const save=async(kind:'auto'|'manual'='auto',reviewedSourceHash?:string,announceSuccess=true):Promise<any>=>{
  if(pending.current){await pending.current;return save(kind,reviewedSourceHash,announceSuccess);}
  if(loading.current||blocked.current||!doc.current||(kind==='auto'&&autoPaused.current))return null;
  if(kind==='auto'&&draftSnapshot(current.current)===saved.current)return doc.current;
  const value=structuredClone(current.current),version=doc.current.version,id=doc.current.id;
  setBusy(true);setStatus(statusText("m_570d602067"));
  const work=(async()=>{try{const d=await api(`/article-drafts/${id}`,{method:'PUT',body:JSON.stringify({version,payload:value,save_kind:kind,locale,reviewed_source_hash:reviewedSourceHash})});if(!alive.current)return null;const next=settleDraftSave(current.current,value,d.payload);if(next!==current.current){current.current=next;setForm(next);}apply(d);autoPaused.current=false;if(kind==='manual'&&announceSuccess)notify.success(t("m_ed6341cbd5"));changedAt.current=draftSnapshot(current.current)===saved.current?0:Date.now();await backup(current.current,d.version);setError('');setErrorStatus(0);setStatus(changedAt.current?statusText("m_6a1be012c9"):statusText("m_a868a1b8ed", {v0: new Date(d.updated_at).toLocaleTimeString(uiLocale,{timeZone:'Asia/Shanghai',hour12:false})}));return d;}catch(e:any){if(!alive.current)return null;autoPaused.current=true;setError(e.message);setErrorStatus(e.status||0);if(kind==='manual')notify.error(e.message);const localSaved=await backup(current.current,version);if(e instanceof ApiError && [401,403,409].includes(e.status)){blocked.current=true;setStatus(e.status===409?statusText("m_6c3599c846"):statusText("m_25ab6d01eb"));}else{setStatus(localSaved?statusText("m_328be72916"):statusText("m_86d855d63c"));}return null;}finally{pending.current=null;if(alive.current)setBusy(false);}})();pending.current=work;return work;
 };
 useEffect(()=>{if(!enabled)return;alive.current=true;let cancelled=false;const init=async()=>{try{
   const params=new URLSearchParams(location.search);const queryKey=locale==='en'?'draft_en':'draft';let id=params.get(queryKey);
   let d;if(id)d=await api(`/article-drafts/${id}`);else{const key=`article-new:${userId}:${postId||'new'}:${locale}`;try{id=sessionStorage.getItem(key);}catch{}id ||= crypto.randomUUID();try{sessionStorage.setItem(key,id);}catch{}d=await api('/article-drafts',{method:'POST',body:JSON.stringify({id,post_id:postId?Number(postId):undefined,payload:{...emptyArticle,summary_mode:locale==='en'?'manual':undefined},locale})});}
   if(cancelled||!alive.current)return;if((d.locale||'zh-CN')!==locale)throw new Error('Draft language mismatch');try{sessionStorage.removeItem(`article-new:${userId}:${postId||'new'}:${locale}`);}catch{}apply(d);current.current=d.payload;setForm(d.payload);const url=new URL(location.href);url.searchParams.set(queryKey,d.id);navigate(url.pathname+url.search+url.hash,{replace:true,preventScrollReset:true,state:{...history.state?.usr,mooncciDraftIdentity:true}});
   try{const local=await readBackup(userId,d.id,locale);if(cancelled)return;if(local&&draftSnapshot(local.payload)!==draftSnapshot(d.payload)){setRecovery(local);blocked.current=true;}}catch{setLocalAvailable(false);}
   if(cancelled)return;loading.current=false;setStatus(statusText("m_a694a43e87"));
  }catch(e:any){if(!cancelled&&alive.current){setError(e.message);setErrorStatus(e.status||0);setStatus(statusText("m_a047469402"));}}};void init();return()=>{cancelled=true;alive.current=false;clearTimeout(timer.current);};},[userId,postId,locale,enabled]);
 useEffect(()=>{if(loading.current||blocked.current||restoring.current||!draft||draftSnapshot(form)===saved.current)return;void backup(form,draft.version);clearTimeout(timer.current);timer.current=setTimeout(()=>void save(),Math.max(0,Math.min(2000,30000-(Date.now()-changedAt.current))));return()=>clearTimeout(timer.current);},[form,draft]);

 const dirty=!!draft&&draftSnapshot(form)!==saved.current;useUnsavedLeave(dirty);
 const resolve=(restore:boolean)=>{if(restore&&recovery)update(recovery.payload);else{current.current=doc.current.payload;setForm(doc.current.payload);void backup(doc.current.payload,doc.current.version);}setRecovery(null);blocked.current=false;setError('');setErrorStatus(0);};
 const generateSummary=async(force=false)=>{
  if(locale==='en')return true;
  if(summaryPending.current)return false;
  const summary=stripLegacyAgeNotice(current.current.summary);
  if(!force&&summary.trim()&&current.current.summary_mode!=='ai')return true;
  if(!force&&current.current.summary_mode==='manual')return true;
  summaryPending.current=true;setSummaryBusy(true);setSummaryError('');const original=structuredClone(current.current),snapshot=draftSnapshot(original),value={...original,summary};if(summary!==original.summary)value.summary_receipt='';
  try{const result=await api('/article-seo/generate',{method:'POST',body:JSON.stringify({payload:value,force}),timeoutMs:35000});if(!alive.current)return false;if(draftSnapshot(current.current)!==snapshot)throw new Error(t("m_7f287de7aa"));if(result.summary_receipt)update({...original,...result});return true;}catch(e:any){if(alive.current)setSummaryError(e.message);return false;}finally{summaryPending.current=false;if(alive.current)setSummaryBusy(false);}
 };
 const generateSlug=async()=>{
  if(locale==='en')return false;
  if(slugPending.current||blocked.current||loading.current||restoring.current)return false;
  slugPending.current=true;setSlugBusy(true);setSlugError('');const original=structuredClone(current.current),snapshot=draftSnapshot(original);
  try{const result=await api('/article-seo/slug',{method:'POST',body:JSON.stringify({payload:original}),timeoutMs:35000});if(!alive.current)return false;if(draftSnapshot(current.current)!==snapshot)throw new Error(t("m_dded3c8572"));update({...original,slug:result.slug});notify.success(t("m_3f3d8b1c66"));return true;}catch(e:any){if(alive.current)setSlugError(e.message);return false;}finally{slugPending.current=false;if(alive.current)setSlugBusy(false);}
 };
 const action=async(kind:'publish'|'withdraw'|'submit')=>{if(kind!=='withdraw'&&!await generateSummary())return false;const d=await save();if(!d)return;setBusy(true);try{const result=await api(kind==='submit'?'/publishing/'+d.id+'/submit':`/article-drafts/${d.id}/${kind}`,{method:'POST',body:JSON.stringify({version:d.version,locale})});if(kind==='submit'){apply({...d,workflow:{...d.workflow,...result}});try{const fresh=await api('/article-drafts/'+d.id);apply(fresh);current.current=fresh.payload;setForm(fresh.payload);}catch{notify.error(t("m_12aadaa5cf"));}}else{apply(result);current.current=result.payload;setForm(result.payload);}setStatus(kind==='submit'?statusText("m_a13f5da574"):kind==='publish'?statusText("m_cda079bcd5"):statusText("m_99b0ee8aac"));setError('');setErrorStatus(0);return true;}catch(e:any){setError(e.message);setErrorStatus(e.status||0);if(e.status===409){blocked.current=true;autoPaused.current=true;setStatus(statusText("m_16e0548d1d"));}return false;}finally{setBusy(false);}};
 const discard=async()=>{
  if(!doc.current)return;blocked.current=true;clearTimeout(timer.current);setBusy(true);
  try{
   if(pending.current)await pending.current;
   const previous=doc.current;
   await api(`/article-drafts/${previous.id}`,{method:'DELETE',body:JSON.stringify({version:previous.version,locale})});
   if(previous.post_id){
    let fresh;
    try{fresh=await api(`/article-drafts/${previous.id}`);}catch(e){if(!(e instanceof ApiError)||e.status!==404)throw e;fresh=await api('/article-drafts',{method:'POST',body:JSON.stringify({id:crypto.randomUUID(),post_id:previous.post_id,locale})});}
    apply(fresh);current.current=fresh.payload;setForm(fresh.payload);changedAt.current=0;blocked.current=false;autoPaused.current=false;
    await backup(fresh.payload,fresh.version);
    const url=new URL(location.href);url.searchParams.set(locale==='en'?'draft_en':'draft',fresh.id);
    navigate(url.pathname+url.search+url.hash,{replace:true,preventScrollReset:true,state:{...history.state?.usr,mooncciDraftIdentity:true}});
   }else{saved.current=draftSnapshot(current.current);setForm({...current.current});navigate(location.pathname.startsWith('/account')?'/account/submissions':'/admin/posts',{replace:true});}
   setError('');setErrorStatus(0);setStatus(statusText("m_b3389c7359"));
  }catch(e:any){setError(e.message);setErrorStatus(e.status||0);}finally{setBusy(false);}
 };
 const inspect=async()=>{blocked.current=true;autoPaused.current=true;clearTimeout(timer.current);setBusy(true);try{if(pending.current)await pending.current;const comparison=await api(`/article-drafts/${doc.current.id}/conflict`);if(!alive.current)return false;setServerCopy(comparison);return true;}catch(e:any){setError(e.message);setErrorStatus(e.status||0);return false;}finally{if(alive.current)setBusy(false);}};
 const resolveConflict=async(choice:'publish-current'|'keep-current'|'adopt-post'|'adopt-draft')=>{
  if(!serverCopy||busy)return false;
  if(choice==='publish-current'&&!await generateSummary())return false;
  setBusy(true);clearTimeout(timer.current);
  const value=structuredClone(current.current);
  try{
   await backup(value,doc.current.version);
   const result=await api(`/article-drafts/${doc.current.id}/resolve-conflict`,{method:'POST',body:JSON.stringify({choice,payload:value,draft_version:serverCopy.draft.version,post_version:serverCopy.post?.version??null,locale})});
   if(!alive.current)return false;
   apply(result);current.current=result.payload;setForm(result.payload);changedAt.current=0;
   await backup(result.payload,result.version);blocked.current=false;autoPaused.current=false;setRecovery(null);setServerCopy(null);setError('');setErrorStatus(0);
   setStatus(choice==='publish-current'?statusText("m_cda079bcd5"):choice==='keep-current'?statusText("m_89756fcee9"):statusText("m_ea62a16b94"));return true;
  }catch(e:any){setError(e.message);setErrorStatus(e.status||0);if(e.status===409){setServerCopy(null);setStatus(statusText("m_d09b1970e0"));}return false;}finally{if(alive.current)setBusy(false);}
 };
 const restore=async(revision:number)=>{
  if(restoring.current||blocked.current)return false;
  restoring.current=true;setIsRestoring(true);clearTimeout(timer.current);
  try{
   const latest=await save('manual');if(!latest)return false;
   const result=await api(`/article-drafts/${latest.id}/revisions/${revision}/restore`,{method:'POST',body:JSON.stringify({version:latest.version,locale})});
   apply(result);current.current=result.payload;setForm(result.payload);changedAt.current=0;
   await backup(result.payload,result.version);setError('');setErrorStatus(0);setStatus(statusText("m_b96623aa52"));return true;
  }catch(e:any){setError(e.message);setErrorStatus(e.status||0);if(e instanceof ApiError&&[401,403,409].includes(e.status))blocked.current=true;return false;}
  finally{restoring.current=false;setIsRestoring(false);}
 };
 const identity=async()=>{
  const d=await save('manual',undefined,false);if(!d)return null;
  if(d.post_id)return d.post_id;
  setBusy(true);
  try{const result=await api(`/article-drafts/${d.id}/identity`,{method:'POST',body:JSON.stringify({version:d.version,locale})});if(!alive.current)return null;apply(result);return result.post_id;}
  catch(e:any){setError(e.message);setErrorStatus(e.status||0);return null;}
  finally{if(alive.current)setBusy(false);}
 };
 const reviewSource=()=>locale==='en'&&doc.current?.current_source_hash?save('manual',doc.current.current_source_hash):Promise.resolve(null);
 return {reviewSource,identity,slugBusy,slugError,generateSlug,summaryBusy,summaryError,generateSummary,restore,isRestoring,discard,serverCopy,inspect,resolveConflict,errorStatus,draft,form,update,status:t(status),error:t(error),recovery,resolve,busy:busy||summaryBusy||slugBusy,localAvailable,save,action,dirty,ready:!loading.current,blocked:blocked.current};
}
