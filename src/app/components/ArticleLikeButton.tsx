import {useEffect,useState} from 'react';
import {Heart} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../context/AuthContext';
import {useLocale} from '../context/LocaleContext';
import {articlePath} from '../lib/articleUrl';
import {api} from '../lib/api';
import '../../styles/article-like.css';

type LikeState={like_count:number;liked:boolean};
export function ArticleLikeButton({id,slug}:{id:number;slug?:string}){
 const {user,loading}=useAuth(),{contentLocale,uiLocale}=useLocale(),navigate=useNavigate();
 const [value,setValue]=useState<LikeState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[burst,setBurst]=useState(0);
 const en=uiLocale==='en';
 useEffect(()=>{const controller=new AbortController();setValue(null);setError('');api(`/article-likes/${id}`,{signal:controller.signal,cache:'no-store'}).then(data=>{if(!controller.signal.aborted)setValue(data)}).catch(()=>{if(!controller.signal.aborted)setError(en?'Could not load likes.':'无法加载点赞。')});return()=>controller.abort()},[id,user?.id,retry,en]);
 async function toggle(){
  if(!user){navigate(`/login?redirect=${encodeURIComponent(articlePath({id,slug},contentLocale))}`);return}
  if(!value||busy)return;setBusy(true);setError('');
  try{const next=await api(`/article-likes/${id}`,{method:value.liked?'DELETE':'PUT'});if(next.liked&&!value.liked)setBurst(n=>n+1);setValue(next)}
  catch{setValue(null);setError(en?'Could not update your like. Please retry.':'点赞状态未确认，请重试。')}finally{setBusy(false)}
 }
 const label=value?.liked?(en?'Remove like':'取消点赞'):(en?'Like article':'点赞文章');
 return <span className="article-like-wrap"><button type="button" className={`article-like quiet-button${value?.liked?' is-liked':''}${burst?' has-burst':''}`} aria-label={`${label}${value?` · ${value.like_count}`:''}`} aria-pressed={Boolean(value?.liked)} disabled={loading||busy||(!value&&!error)} onClick={()=>error&&!value?setRetry(n=>n+1):void toggle()}><span className="article-like-icon"><Heart size={18} fill={value?.liked?'currentColor':'none'} aria-hidden="true"/>{burst>0&&<span className="article-like-burst" key={burst} aria-hidden="true"><i/><i/><i/><i/><i/><i/></span>}</span><span>{value?.like_count??'—'}</span></button>{error&&<span role="status" className="article-like-error">{error} <button type="button" className="text-link" onClick={()=>setRetry(n=>n+1)}>{en?'Retry':'重试'}</button></span>}</span>;
}
