import { notify } from './feedback';
import {useEffect,useRef,useState} from 'react';
import {api,ApiError} from './api';
import {readBackup,writeBackup,DraftBackup} from './draftStorage';
import {useUnsavedLeave} from './useUnsavedLeave';
export const emptyArticle={title:'',content:'',slug:'',summary:'',cover_image:'',category:'',tags:[] as string[]};
export function useArticleDraft(userId:number,postId?:string){
 const [draft,setDraft]=useState<any>(null),[form,setForm]=useState<any>(emptyArticle),[status,setStatus]=useState('正在加载…'),[error,setError]=useState(''),[recovery,setRecovery]=useState<DraftBackup|null>(null),[busy,setBusy]=useState(false),[localAvailable,setLocalAvailable]=useState(true),[serverCopy,setServerCopy]=useState<any>(null);
 const [errorStatus,setErrorStatus]=useState(0);
 const current=useRef(form),saved=useRef(''),doc=useRef<any>(null),loading=useRef(true),blocked=useRef(false),pending=useRef<Promise<any>|null>(null),timer=useRef<ReturnType<typeof setTimeout>>(),changedAt=useRef(0),alive=useRef(true);
 const update=(input:any)=>{if(restoring.current)return;const value=typeof input==='function'?input(current.current):input;current.current=value;setForm(value);changedAt.current ||= Date.now();setStatus('未保存');};
 const backup=async(value:any,version:number)=>{if(!doc.current)return;try{await writeBackup({userId,draftId:doc.current.id,payload:value,version,updatedAt:Date.now()});if(alive.current)setLocalAvailable(true);return true;}catch{if(alive.current)setLocalAvailable(false);return false;}};
 const apply=(d:any)=>{doc.current=d;setDraft(d);saved.current=JSON.stringify(d.payload);};
 const autoPaused=useRef(false);const restoring=useRef(false);const [isRestoring,setIsRestoring]=useState(false);
 const save=async(kind:'auto'|'manual'='auto'):Promise<any>=>{
  if(pending.current){await pending.current;return save(kind);}
  if(loading.current||blocked.current||!doc.current||(kind==='auto'&&autoPaused.current))return null;
  if(kind==='auto'&&JSON.stringify(current.current)===saved.current)return doc.current;
  const value=structuredClone(current.current),version=doc.current.version,id=doc.current.id;
  setBusy(true);setStatus('正在保存');
  const work=(async()=>{try{const d=await api(`/article-drafts/${id}`,{method:'PUT',body:JSON.stringify({version,payload:value,save_kind:kind})});if(!alive.current)return null;apply(d);autoPaused.current=false;if(kind==='manual')notify.success('草稿已保存');changedAt.current=JSON.stringify(current.current)===saved.current?0:Date.now();await backup(current.current,d.version);setError('');setErrorStatus(0);setStatus(changedAt.current?'未保存':`已保存到服务器 · ${new Date(d.updated_at).toLocaleTimeString()}`);return d;}catch(e:any){if(!alive.current)return null;autoPaused.current=true;setError(e.message);setErrorStatus(e.status||0);if(kind==='manual')notify.error(e.message);const localSaved=await backup(current.current,version);if(e instanceof ApiError && [401,403,409].includes(e.status)){blocked.current=true;setStatus(e.status===409?'版本冲突，请保留当前内容后处理':'登录或权限已失效，请重新登录');}else{setStatus(localSaved?'仅保存在本机 · 服务器保存失败':'保存失败，本机副本也不可用，请复制内容');}return null;}finally{pending.current=null;if(alive.current)setBusy(false);}})();pending.current=work;return work;
 };
 useEffect(()=>{alive.current=true;const init=async()=>{try{
   const params=new URLSearchParams(location.search);let id=params.get('draft');
   let d;if(id)d=await api(`/article-drafts/${id}`);else{const key=`article-new:${userId}:${postId||'new'}`;try{id=sessionStorage.getItem(key);}catch{}id ||= crypto.randomUUID();try{sessionStorage.setItem(key,id);}catch{}d=await api('/article-drafts',{method:'POST',body:JSON.stringify({id,post_id:postId?Number(postId):undefined,payload:emptyArticle})});}
   if(!alive.current)return;try{sessionStorage.removeItem(`article-new:${userId}:${postId||'new'}`);}catch{}apply(d);current.current=d.payload;setForm(d.payload);const url=new URL(location.href);url.searchParams.set('draft',d.id);history.replaceState(history.state,'',url);
   try{const local=await readBackup(userId,d.id);if(local&&JSON.stringify(local.payload)!==JSON.stringify(d.payload)){setRecovery(local);blocked.current=true;}}catch{setLocalAvailable(false);}
   loading.current=false;setStatus('已保存到服务器');
  }catch(e:any){if(alive.current){setError(e.message);setErrorStatus(e.status||0);setStatus('加载失败，禁止提交');}}};void init();return()=>{alive.current=false;clearTimeout(timer.current);};},[userId,postId]);
 useEffect(()=>{if(loading.current||blocked.current||restoring.current||!draft||JSON.stringify(form)===saved.current)return;void backup(form,draft.version);clearTimeout(timer.current);timer.current=setTimeout(()=>void save(),Math.max(0,Math.min(2000,30000-(Date.now()-changedAt.current))));return()=>clearTimeout(timer.current);},[form,draft]);

 const dirty=!!draft&&JSON.stringify(form)!==saved.current;useUnsavedLeave(dirty);
 const resolve=(restore:boolean)=>{if(restore&&recovery)update(recovery.payload);else{current.current=doc.current.payload;setForm(doc.current.payload);void backup(doc.current.payload,doc.current.version);}setRecovery(null);blocked.current=false;setError('');setErrorStatus(0);};
 const action=async(kind:'publish'|'withdraw'|'submit')=>{const d=await save('manual');if(!d)return;setBusy(true);try{const result=await api(kind==='submit'?'/publishing/'+d.id+'/submit':`/article-drafts/${d.id}/${kind}`,{method:'POST',body:JSON.stringify({version:d.version})});if(kind==='submit'){apply({...d,workflow:{...d.workflow,...result}});try{apply(await api('/article-drafts/'+d.id));}catch{notify.error('稿件已提交审核，状态刷新失败；可返回稿件列表查看。');}}else apply(result);setStatus(kind==='submit'?'已提交审核':kind==='publish'?'发布成功':'已撤回为草稿');setError('');setErrorStatus(0);return true;}catch(e:any){setError(e.message);setErrorStatus(e.status||0);if(e.status===409){blocked.current=true;autoPaused.current=true;setStatus('版本冲突，尚未发布');}return false;}finally{setBusy(false);}};
 const discard=async()=>{if(!doc.current||busy)return;const wasBlocked=blocked.current;blocked.current=true;clearTimeout(timer.current);setBusy(true);try{if(pending.current)await pending.current;await api(`/article-drafts/${doc.current.id}`,{method:'DELETE',body:JSON.stringify({version:doc.current.version})});saved.current=JSON.stringify(current.current);setForm({...current.current});setStatus('已放弃未发布修改');setTimeout(()=>{if(location.pathname.startsWith('/account')){location.replace('/account/submissions');return;}if(!doc.current.post_id){location.replace(location.pathname.startsWith('/account')?'/account/submissions':'/admin/posts');return;}const url=new URL(location.href);url.searchParams.delete('draft');location.replace(url);},0);}catch(e:any){blocked.current=wasBlocked||!!e.uncertain||[401,403,409].includes(e.status);setError(e.message);setErrorStatus(e.status||0);setStatus(blocked.current?'放弃结果需要核对，请保留当前内容后处理':'放弃失败，当前内容仍可继续编辑和保存');setBusy(false);}};
 const inspect=async()=>{blocked.current=true;autoPaused.current=true;clearTimeout(timer.current);setBusy(true);try{if(pending.current)await pending.current;const comparison=await api(`/article-drafts/${doc.current.id}/conflict`);if(!alive.current)return false;setServerCopy(comparison);return true;}catch(e:any){setError(e.message);setErrorStatus(e.status||0);return false;}finally{if(alive.current)setBusy(false);}};
 const resolveConflict=async(choice:'publish-current'|'keep-current'|'adopt-post'|'adopt-draft')=>{
  if(!serverCopy||busy)return false;
  setBusy(true);clearTimeout(timer.current);
  const value=structuredClone(current.current);
  try{
   await backup(value,doc.current.version);
   const result=await api(`/article-drafts/${doc.current.id}/resolve-conflict`,{method:'POST',body:JSON.stringify({choice,payload:value,draft_version:serverCopy.draft.version,post_version:serverCopy.post?.version??null})});
   if(!alive.current)return false;
   apply(result);current.current=result.payload;setForm(result.payload);changedAt.current=0;
   await backup(result.payload,result.version);blocked.current=false;autoPaused.current=false;setRecovery(null);setServerCopy(null);setError('');setErrorStatus(0);
   setStatus(choice==='publish-current'?'发布成功':choice==='keep-current'?'已保留当前草稿，尚未发布':'已采用所选版本，尚未发布');return true;
  }catch(e:any){setError(e.message);setErrorStatus(e.status||0);if(e.status===409){setServerCopy(null);setStatus('版本再次变化，请重新对比');}return false;}finally{if(alive.current)setBusy(false);}
 };
 const restore=async(revision:number)=>{
  if(restoring.current||blocked.current)return false;
  restoring.current=true;setIsRestoring(true);clearTimeout(timer.current);
  try{
   const latest=await save('manual');if(!latest)return false;
   const result=await api(`/article-drafts/${latest.id}/revisions/${revision}/restore`,{method:'POST',body:JSON.stringify({version:latest.version})});
   apply(result);current.current=result.payload;setForm(result.payload);changedAt.current=0;
   await backup(result.payload,result.version);setError('');setErrorStatus(0);setStatus('已恢复为草稿，尚未发布');return true;
  }catch(e:any){setError(e.message);setErrorStatus(e.status||0);if(e instanceof ApiError&&[401,403,409].includes(e.status))blocked.current=true;return false;}
  finally{restoring.current=false;setIsRestoring(false);}
 };
 return {restore,isRestoring,discard,serverCopy,inspect,resolveConflict,errorStatus,draft,form,update,status,error,recovery,resolve,busy,localAvailable,save,action,dirty,ready:!loading.current,blocked:blocked.current};
}
