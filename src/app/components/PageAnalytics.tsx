import {useEffect,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {useAuth} from '../context/AuthContext';
import {api} from '../lib/api';
export function usePageView(path:string|null,postId?:number){
 const {loading}=useAuth();const [views,setViews]=useState<number|null>(null);
 useEffect(()=>{
  setViews(null);if(!path||loading)return;
  let active=true;
  const timer=window.setTimeout(async()=>{
   const ignored=navigator.doNotTrack==='1'||document.visibilityState==='hidden';
   try{
    let result;
    if(ignored){if(!postId)return;result=await api(`/analytics/article/${postId}`);}
    else{
     let referrer='';try{if(document.referrer){const u=new URL(document.referrer);if(u.origin!==location.origin)referrer=u.origin;}}catch{}
     result=await api('/analytics/view',{method:'POST',body:JSON.stringify({path,referrer,device:innerWidth<600?'mobile':innerWidth<1024?'tablet':'desktop'})});
    }
    if(active&&typeof result.views==='number')setViews(result.views);
   }catch{
    // Analytics failure must never interrupt reading or authentication.
    if(postId)try{const result=await api(`/analytics/article/${postId}`);if(active&&typeof result.views==='number')setViews(result.views);}catch{}
   }
  },500);
  return()=>{active=false;clearTimeout(timer);};
 },[path,postId,loading]);
 return views;
}
export function PageAnalytics(){
 const {pathname}=useLocation();
 const allowed=/^\/(?:$|articles$|updates(?:\/[^/]+)?$|projects(?:\/[^/]+)?$|tags$|categories$|search$|early-access$|electricity$|rss$)/.test(pathname);
 usePageView(allowed?pathname:null);
 return null;
}
