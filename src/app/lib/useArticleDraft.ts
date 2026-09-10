import {useEffect,useRef,useState} from 'react';
import {api,ApiError} from './api';
import {readBackup,writeBackup,DraftBackup} from './draftStorage';
import {useUnsavedLeave} from './useUnsavedLeave';
export const emptyArticle={title:'',content:'',slug:'',summary:'',cover_image:'',category:'',tags:[] as string[]};
export function useArticleDraft(userId:number,postId?:string){
 const [draft,setDraft]=useState<any>(null),[form,setForm]=useState<any>(emptyArticle),[status,setStatus]=useState('正在加载…'),[error,setError]=useState(''),[recovery,setRecovery]=useState<DraftBackup|null>(null),[busy,setBusy]=useState(false),[localAvailable,setLocalAvailable]=useState(true),[serverCopy,setServerCopy]=useState<any>(null);
 const current=useRef(form),saved=useRef(''),doc=useRef<any>(null),loading=useRef(true),blocked=useRef(false),pending=useRef<Promise<any>|null>(null),timer=useRef<ReturnType<typeof setTimeout>>(),retry=useRef<ReturnType<typeof setTimeout>>(),attempt=useRef(0),changedAt=useRef(0),alive=useRef(true);
 const update=(input:any)=>{const value=typeof input==='function'?input(current.current):input;current.current=value;setForm(value);changedAt.current ||= Date.now();setStatus('未保存');};
 const backup=async(value:any,version:number)=>{if(!doc.current)return;try{await writeBackup({userId,draftId:doc.current.id,payload:value,version,updatedAt:Date.now()});if(alive.current)setLocalAvailable(true);return true;}catch{if(alive.current)setLocalAvailable(false);return false;}};
 const apply=(d:any)=>{doc.current=d;setDraft(d);saved.current=JSON.stringify(d.payload);};
 const save=async():Promise<any>=>{
  if(pending.current){await pending.current;return save();}
  if(loading.current||blocked.current||!doc.current)return null;
  if(JSON.stringify(current.current)===saved.current)return doc.current;
  const value=structuredClone(current.current),version=doc.current.version,id=doc.current.id;
  setBusy(true);setStatus('正在保存');clearTimeout(retry.current);
  const work=(async()=>{try{const d=await api(`/article-drafts/${id}`,{method:'PUT',body:JSON.stringify({version,payload:value})});if(!alive.current)return null;apply(d);attempt.current=0;changedAt.current=JSON.stringify(current.current)===saved.current?0:Date.now();await backup(current.current,d.version);setError('');setStatus(changedAt.current?'未保存':`已保存到服务器 · ${new Date(d.updated_at).toLocaleTimeString()}`);return d;}catch(e:any){if(!alive.current)return null;setError(e.message);const localSaved=await backup(current.current,version);if(e instanceof ApiError && [401,403,409].includes(e.status)){blocked.current=true;setStatus(e.status===409?'版本冲突，请保留当前内容后处理':'登录或权限已失效，请重新登录');}else{setStatus(localSaved?'仅保存在本机 · 服务器保存失败':'保存失败，本机副本也不可用，请复制内容');const delay=[5000,15000,30000][attempt.current++];if(delay)retry.current=setTimeout(()=>void save(),delay);}return null;}finally{pending.current=null;if(alive.current)setBusy(false);}})();pending.current=work;return work;
 };
 useEffect(()=>{alive.current=true;const init=async()=>{try{
   const params=new URLSearchParams(location.search);let id=params.get('draft');
   let d;if(id)d=await api(`/article-drafts/${id}`);else{const key=`article-new:${userId}:${postId||'new'}`;try{id=sessionStorage.getItem(key);}catch{}id ||= crypto.randomUUID();try{sessionStorage.setItem(key,id);}catch{}d=await api('/article-drafts',{method:'POST',body:JSON.stringify({id,post_id:postId?Number(postId):undefined,payload:emptyArticle})});}
   if(!alive.current)return;try{sessionStorage.removeItem(`article-new:${userId}:${postId||'new'}`);}catch{}apply(d);current.current=d.payload;setForm(d.payload);const url=new URL(location.href);url.searchParams.set('draft',d.id);history.replaceState(history.state,'',url);
   try{const local=await readBackup(userId,d.id);if(local&&JSON.stringify(local.payload)!==JSON.stringify(d.payload)){setRecovery(local);blocked.current=true;}}catch{setLocalAvailable(false);}
   loading.current=false;setStatus('已保存到服务器');
  }catch(e:any){if(alive.current){setError(e.message);setStatus('加载失败，禁止提交');}}};void init();return()=>{alive.current=false;clearTimeout(timer.current);clearTimeout(retry.current);};},[userId,postId]);
 useEffect(()=>{if(loading.current||blocked.current||!draft||JSON.stringify(form)===saved.current)return;void backup(form,draft.version);clearTimeout(timer.current);timer.current=setTimeout(()=>void save(),Math.max(0,Math.min(2000,30000-(Date.now()-changedAt.current))));return()=>clearTimeout(timer.current);},[form,draft]);
 useEffect(()=>{const online=()=>{if(!blocked.current){attempt.current=0;void save();}};window.addEventListener('online',online);return()=>window.removeEventListener('online',online);},[]);
 const dirty=!!draft&&JSON.stringify(form)!==saved.current;useUnsavedLeave(dirty);
 const resolve=(restore:boolean)=>{if(restore&&recovery)update(recovery.payload);else{current.current=doc.current.payload;setForm(doc.current.payload);void backup(doc.current.payload,doc.current.version);}setRecovery(null);blocked.current=false;setError('');};
 const action=async(kind:'publish'|'withdraw')=>{const d=await save();if(!d)return;setBusy(true);try{const result=await api(`/article-drafts/${d.id}/${kind}`,{method:'POST',body:JSON.stringify({version:d.version})});apply(result);setStatus(kind==='publish'?'发布成功':'已撤回为草稿');setError('');}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const discard=async()=>{if(!doc.current?.post_id)return;blocked.current=true;clearTimeout(timer.current);clearTimeout(retry.current);setBusy(true);try{if(pending.current)await pending.current;await api(`/article-drafts/${doc.current.id}`,{method:'DELETE',body:JSON.stringify({version:doc.current.version})});saved.current=JSON.stringify(current.current);setForm({...current.current});setStatus('已放弃未发布修改');setTimeout(()=>{const url=new URL(location.href);url.searchParams.delete('draft');location.replace(url);},0);}catch(e:any){setError(e.message);setBusy(false);}};
 const inspect=async()=>{try{setServerCopy(await api(`/article-drafts/${doc.current.id}`));}catch(e:any){setError(e.message);}};
 const adopt=()=>{if(!serverCopy)return;apply(serverCopy);current.current=serverCopy.payload;setForm(serverCopy.payload);void backup(serverCopy.payload,serverCopy.version);blocked.current=false;setRecovery(null);setServerCopy(null);setError('');setStatus('已加载服务器版本');};
 return {discard,serverCopy,inspect,adopt,draft,form,update,status,error,recovery,resolve,busy,localAvailable,save,action,dirty,ready:!loading.current,blocked:blocked.current};
}
