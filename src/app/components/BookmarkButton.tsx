import { notify } from '../lib/feedback';
import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Bookmark,LoaderCircle} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {api} from '../lib/api';
export function BookmarkButton({id}:{id:number}){
 const {user,loading}=useAuth(),navigate=useNavigate();
 if(!user)return <button className="quiet-button" disabled={loading} onClick={()=>navigate(`/login?redirect=${encodeURIComponent(`/article/${id}`)}`)}><Bookmark size={16} aria-hidden="true"/> 收藏</button>;
 return <SavedButton key={`${user.id}:${id}`} id={id}/>;
}
function SavedButton({id}:{id:number}){
 const [saved,setSaved]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[actionError,setActionError]=useState(''),[tick,setTick]=useState(0);
 const pending=useRef(false),mounted=useRef(true),retryTarget=useRef<boolean|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')setTick(n=>n+1);};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[]);
 useEffect(()=>{
  if(pending.current)return;const c=new AbortController();
  api(`/bookmarks/${id}`,{signal:c.signal,cache:'no-store'}).then(r=>{if(!c.signal.aborted){setSaved(r.bookmarked);setError('');}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});
  return()=>c.abort();
 },[id,tick,busy]);
 async function setBookmark(target:boolean){
  if(pending.current)return;pending.current=true;setBusy(true);setActionError('');retryTarget.current=null;
  try{const r=await api(`/bookmarks/${id}`,{method:target?'PUT':'DELETE'});if(mounted.current){setSaved(r.bookmarked);setError('');notify.success(r.bookmarked?'已加入收藏':'已取消收藏');}}
  catch(e:any){if(mounted.current){retryTarget.current=target;setActionError(e.message);notify.error(e.message);}}
  finally{pending.current=false;if(mounted.current)setBusy(false);}
 }
 const waiting=busy||(saved===null&&!error),label=saved?'已收藏':'收藏';
 return <><button className="quiet-button" aria-label={waiting?(busy?'正在保存…':'正在读取…'):undefined} aria-pressed={saved===true} aria-busy={waiting} disabled={busy||saved===null} onClick={()=>void setBookmark(!saved)}><span className="control-state-icon" data-busy={waiting}>{waiting?<LoaderCircle size={16} aria-hidden="true"/>:<Bookmark size={16} aria-hidden="true" fill={saved?'currentColor':'none'}/>}</span><span className="control-state-label" data-action-reserve="已收藏"><span key={label}>{label}</span></span></button>{(error||actionError)&&<span role="status">{actionError||error} <button className="text-link" disabled={busy} onClick={()=>{if(retryTarget.current!==null)void setBookmark(retryTarget.current);else setTick(n=>n+1);}}>重试</button></span>}</>;
}
