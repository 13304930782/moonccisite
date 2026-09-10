import {useContext,useEffect} from 'react';
import {UNSAFE_NavigationContext} from 'react-router-dom';
export function useUnsavedLeave(dirty:boolean){const {navigator}=useContext(UNSAFE_NavigationContext);useEffect(()=>{
 if(!dirty)return;
 const ask=()=>window.confirm('仍有未同步的改动，确定离开吗？');
 const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
 const push=navigator.push,replace=navigator.replace;let index=history.state?.idx??0,restoring=false;
 navigator.push=(...args)=>{if(ask())push.apply(navigator,args);};
 navigator.replace=(...args)=>{if(ask())replace.apply(navigator,args);};
 const pop=(e:PopStateEvent)=>{const next=e.state?.idx;if(typeof next!=='number')return;if(restoring){restoring=false;index=next;e.stopImmediatePropagation();return;}if(!ask()){e.stopImmediatePropagation();restoring=true;history.go(index-next);}else index=next;};
 window.addEventListener('beforeunload',unload);window.addEventListener('popstate',pop,true);
 return()=>{navigator.push=push;navigator.replace=replace;window.removeEventListener('beforeunload',unload);window.removeEventListener('popstate',pop,true);};
},[dirty,navigator]);}
