import { useLocale } from '../context/LocaleContext';
import { useI18n } from '../i18n';
import { articlePath } from '../lib/articleUrl';
import { notify } from '../lib/feedback';
import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Bookmark} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {api} from '../lib/api';
export function BookmarkButton({id,slug}:{id:number;slug?:string}){
  const { t } = useI18n();
  const { contentLocale } = useLocale();
 const {user,loading}=useAuth(),navigate=useNavigate();
 if(!user)return <button className="quiet-button" disabled={loading} onClick={()=>navigate(`/login?redirect=${encodeURIComponent(articlePath({id,slug}, contentLocale))}`)}><Bookmark size={16} aria-hidden="true"/>  {t("m_60a53514eb")}</button>;
 return <SavedButton key={`${user.id}:${id}`} id={id}/>;
}
function SavedButton({id}:{id:number}){
  const { t } = useI18n();
 const [saved,setSaved]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[actionError,setActionError]=useState(''),[tick,setTick]=useState(0);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')setTick(n=>n+1);};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[]);
 useEffect(()=>{
  if(busy)return;const c=new AbortController();
  api(`/bookmarks/${id}`,{signal:c.signal,cache:'no-store'}).then(r=>{if(!c.signal.aborted){setSaved(r.bookmarked);setError('');}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});
  return()=>c.abort();
 },[id,tick,busy]);
 async function toggle(){
  if(busy)return;setBusy(true);setActionError('');
  try{const r=await api(`/bookmarks/${id}`,{method:saved?'DELETE':'PUT'});setSaved(r.bookmarked);notify.success(r.bookmarked?t("m_4220592340"):t("m_7fa7b63b0e"));}
  catch(e:any){setActionError(e.message); notify.error(e.message);}
  finally{setBusy(false);}
 }
 return <><button className="quiet-button" aria-pressed={saved===true} disabled={busy||saved===null} onClick={()=>void toggle()}><Bookmark size={16} aria-hidden="true" fill={saved?'currentColor':'none'}/>{busy?t("m_6bdb443509"):saved?t("m_471dd4d7f8"):t("m_60a53514eb")}</button>{(error||actionError)&&<span role="status">{actionError||error} <button className="text-link" onClick={()=>setTick(n=>n+1)}>{t("m_b8784c8dd5")}</button></span>}</>;
}
