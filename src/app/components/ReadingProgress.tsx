import { reducedMotion } from '../lib/motionPreference';
import {useEffect,useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {useEngagement} from '../lib/useEngagement';
import {api} from '../lib/api';
export function ReadingProgress({postId}:{postId:number}){
 const {user}=useAuth(),enabled=useEngagement(),[saved,setSaved]=useState<any>(null),[error,setError]=useState(''),[connection,setConnection]=useState(0);

 useEffect(()=>{
  if(!enabled||!postId)return;
  let alive=true,ready=false,dirty=false,writing=false,stopped=false,revision=0,epoch=0;
  const key='mooncci-reading-'+postId;
  const initial=async()=>{try{
   if(!user){for(const entry of Object.keys(localStorage)){if(!entry.startsWith('mooncci-reading-'))continue;try{const value=JSON.parse(localStorage.getItem(entry)||'null');if(!value||Date.now()-Number(value.updated_at)>180*86400000)localStorage.removeItem(entry);}catch{localStorage.removeItem(entry);}}}

   const r=user?await api('/engagement/history/'+postId):{enabled:true,item:JSON.parse(localStorage.getItem(key)||'null'),epoch:0};
   if(!alive)return;ready=r.enabled;epoch=r.epoch;revision=Number(r.item?.revision||0);if(!user&&r.item&&Date.now()-Number(r.item.updated_at)>180*86400000){localStorage.removeItem(key);revision=0;setSaved(null);}else setSaved(r.item);
  }catch{ready=false;}};void initial();
  const save=async()=>{
   if(!alive||!ready||!dirty||writing||stopped)return;
   const article=document.querySelector('.article-presentation');if(!article)return;
   const rect=article.getBoundingClientRect(),height=Math.max(1,rect.height-innerHeight);
   const progress=Math.max(0,Math.min(1,-rect.top/height));
   const headings=Array.from(article.querySelectorAll<HTMLElement>('h1[id],h2[id],h3[id],h4[id]'));
   const anchor=headings.filter(h=>h.getBoundingClientRect().top<=120).pop()?.id||'';
   writing=true;dirty=false;
   try{
    if(user){const r=await api('/engagement/history/'+postId,{method:'PUT',body:JSON.stringify({anchor,progress,revision,epoch})});revision=r.revision;}
    else{
     const previous=JSON.parse(localStorage.getItem(key)||'null');
     if(Number(previous?.revision||0)!==revision){stopped=true;return;}
     revision++;localStorage.setItem(key,JSON.stringify({anchor,progress,revision,updated_at:Date.now()}));
    }
   }catch(e:any){if(e.status===409){stopped=true;setError('阅读记录已在其他页面更新，重新打开文章可同步。');}else{stopped=true;if(alive)setError('阅读进度暂未确认，已暂停同步。可重新连接后继续记录。');}}
   finally{writing=false;}
  };
  const scroll=()=>{if(ready)dirty=true;};const hidden=()=>{if(document.visibilityState==='hidden')void save();};
  window.addEventListener('scroll',scroll,{passive:true});document.addEventListener('visibilitychange',hidden);
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void save();},15000);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('scroll',scroll);document.removeEventListener('visibilitychange',hidden);};
 },[postId,user?.id,enabled,connection]);
 const resume=()=>{
  const behavior=reducedMotion()?'auto':'smooth';
  const anchor=saved?.anchor&&document.getElementById(saved.anchor);
  if(anchor)anchor.scrollIntoView({behavior,block:'start'});
  else{const article=document.querySelector('.article-presentation');if(article){const rect=article.getBoundingClientRect();window.scrollTo({top:scrollY+rect.top+saved.progress*Math.max(1,rect.height-innerHeight),behavior});}}
  setSaved(null);
 };
 if(!enabled)return null;
 return <>{saved&&saved.progress>0.01&&<div className="reading-resume" role="status"><span>上次读到 {Math.round(saved.progress*100)}%{!user?' · 仅保存在此浏览器':''}</span><button onClick={resume}>继续阅读</button><button aria-label="关闭阅读进度提示" onClick={()=>setSaved(null)}>×</button></div>}{error&&<p className="reading-resume" role="status">{error} <button onClick={()=>{setError('');setConnection(n=>n+1);}}>重新连接</button></p>}</>;
}
