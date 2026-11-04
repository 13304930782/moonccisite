import {useEffect} from 'react';
import {useAuth} from '../context/AuthContext';
import {useLocale} from '../context/LocaleContext';
import {api} from '../lib/api';
import {PageAnalytics} from './PageAnalytics';
export default function LocaleEffects(){
  const {user,loading}=useAuth();const {uiLocale,ready}=useLocale();
  useEffect(()=>{let cancelled=false,dispose:(()=>void)|undefined;void import('../lib/nativeValidation').then(module=>{if(!cancelled)dispose=module.installNativeValidation(document,()=>uiLocale);}).catch(()=>{/* Native browser validation remains available if this optional chunk is offline. */});return()=>{cancelled=true;dispose?.();};},[uiLocale]);
  useEffect(()=>{if(loading||!ready||!user)return;const controller=new AbortController();void api('/account/locale',{method:'PUT',body:JSON.stringify({locale:uiLocale}),signal:controller.signal}).catch(()=>{});return()=>controller.abort();},[user?.id,loading,ready,uiLocale]);
  return <PageAnalytics/>;
}
