import { notify } from '../lib/feedback';
import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Bookmark} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {api} from '../lib/api';
export function BookmarkButton({id}:{id:number}){
 const {user,loading}=useAuth(),navigate=useNavigate();
 if(!user)return <button className="quiet-button" disabled={loading} onClick={()=>navigate(`/login?redirect=${encodeURIComponent(`/article/${id}`)}`)}><Bookmark size={16} aria-hidden="true"/> 收藏</button>;
 return <SavedButton key={`${user.id}:${id}`} id={id}/>;
}
function SavedButton({id}:{id:number}){
 const [saved,setSaved]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[actionError,setActionError]=useState(''),[tick,setTick]=useState(0);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')setTick(n=>n+1);};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[]);
 useEffect(()=>{
  if(busy)return;const c=new AbortController();
  api(`/bookmarks/${id}`,{signal:c.signal,cache:'no-store'}).then(r=>{if(!c.signal.aborted){setSaved(r.bookmarked);setError('');}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});
  return()=>c.abort();
 },[id,tick,busy]);
 async function toggle(){
  if(busy)return;setBusy(true);setActionError('');
  try{const r=await api(`/bookmarks/${id}`,{method:saved?'DELETE':'PUT'});setSaved(r.bookmarked);notify.success(r.bookmarked?'已加入收藏':'已取消收藏');}
  catch(e:any){setActionError(e.message); notify.error(e.message);}
  finally{setBusy(false);}
 }
 return <><button className="quiet-button" aria-pressed={saved===true} disabled={busy||saved===null} onClick={()=>void toggle()}><Bookmark size={16} aria-hidden="true" fill={saved?'currentColor':'none'}/>{busy?'正在保存…':saved?'已收藏':'收藏'}</button>{(error||actionError)&&<span role="status">{actionError||error} <button className="text-link" onClick={()=>setTick(n=>n+1)}>重试</button></span>}</>;
}
