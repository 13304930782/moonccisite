import {useSyncExternalStore} from 'react';
const key='mooncci-floating-control',event='mooncci:floating-control';
let memoryControl:FloatingControl='ball',memoryNavigation=0;
export type FloatingControl='ball'|'arrow';
export function getFloatingControl():FloatingControl{try{return localStorage.getItem(key)==='arrow'?'arrow':'ball';}catch{return memoryControl;}}
export function setFloatingControl(value:FloatingControl){memoryControl=value;try{localStorage.setItem(key,value);}catch{/* Keep existing preference if storage is unavailable. */}window.dispatchEvent(new Event(event));}
function subscribe(listener:()=>void){window.addEventListener(event,listener);window.addEventListener('storage',listener);return()=>{window.removeEventListener(event,listener);window.removeEventListener('storage',listener);};}
export function useFloatingControl(){return useSyncExternalStore(subscribe,getFloatingControl,()=> 'ball' as FloatingControl);}

const navKey='mooncci-navigation-motion';
export function getNavigationMotion(){try{return Number(localStorage.getItem(navKey))||0;}catch{return memoryNavigation;}}
export function setNavigationMotion(value:number){memoryNavigation=value;try{localStorage.setItem(navKey,String(value));}catch{/* Keep settings available in memory for this page. */}window.dispatchEvent(new Event(event));}
export function useNavigationMotion(){return useSyncExternalStore(subscribe,getNavigationMotion,()=>0);}
