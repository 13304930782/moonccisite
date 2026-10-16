import {useEffect,useRef,useState} from 'react';
import {reducedMotion} from '../lib/motionPreference';
import {MotionDisclosure,MotionChevron} from './MotionDisclosure';
type Heading={id:string;title:string;level:number};
export function ReadingSettingsTrigger({compact=false,className=''}:{compact?:boolean;className?:string}){
 const [settingsOpen,setSettingsOpen]=useState(false);
 useEffect(()=>{
  const state=(event:Event)=>setSettingsOpen(Boolean((event as CustomEvent).detail?.open));
  window.addEventListener('mooncci:reading-tools-state',state);return()=>window.removeEventListener('mooncci:reading-tools-state',state);
 },[]);
 return <button type="button" className={`reading-settings-trigger ${compact?'reading-toolbar-settings':'toc-reading-trigger'} ${className}`} aria-label="阅读设置" aria-expanded={settingsOpen} aria-controls="reading-settings-panel" onClick={event=>window.dispatchEvent(new CustomEvent('mooncci:reading-tools-open',{detail:{trigger:event.currentTarget}}))}><span aria-hidden="true">Aa</span>{!compact&&'阅读设置'}</button>;
}
export function ArticleTableOfContents({headings,preview=false,settingsInHeader=false}:{headings:Heading[];preview?:boolean;settingsInHeader?:boolean}){
 const [active,setActive]=useState(headings[0]?.id||''),[open,setOpen]=useState(false);
 const rail=useRef<HTMLElement>(null);
 const cancelJump=useRef(()=>{});
 useEffect(()=>()=>cancelJump.current(),[]);
 useEffect(()=>{
  setActive(headings[0]?.id||'');
  const doc=rail.current?.ownerDocument,win=doc?.defaultView;if(!doc||!win)return;
  const collect=()=>headings.map(h=>doc.getElementById(h.id)).filter((h):h is HTMLElement=>!!h);
  let nodes:HTMLElement[]=[];
  const select=()=>{
   const current=collect();if(!current.length)return;
   const line=win.innerHeight*.2;
   const passed=current.filter(node=>node.getBoundingClientRect().top<=line+1);
   setActive((passed.at(-1)||current[0]).id);
  };
  const observer=new win.IntersectionObserver(select,{rootMargin:'-20% 0px -70% 0px'});
  const observe=()=>{
   const current=collect();if(current.length===nodes.length&&current.every((node,i)=>node===nodes[i]))return;
   observer.disconnect();nodes=current;nodes.forEach(node=>observer.observe(node));select();
  };
  // Markdown can replace heading elements after cover/view data arrives.
  const changes=new win.MutationObserver(observe),body=rail.current?.parentElement?.querySelector('.detail-body');
  if(body)changes.observe(body,{childList:true,subtree:true});
  // Large jumps can skip the observer's narrow activation band.
  let frame=0;
  const onScroll=()=>{if(!frame)frame=win.requestAnimationFrame(()=>{frame=0;select();});};
  win.addEventListener('scroll',onScroll,{passive:true});
  observe();select();
  return()=>{changes.disconnect();observer.disconnect();win.removeEventListener('scroll',onScroll);if(frame)win.cancelAnimationFrame(frame);};
 },[headings]);
 const links=<nav aria-label="文章目录">{headings.map(h=><a key={h.id} title={h.title} className={`${h.level>=3?'toc-sub ':''}${active===h.id?'on':''}`} aria-current={active===h.id?'location':undefined} href={`#${h.id}`} onClick={event=>{
  const doc=rail.current?.ownerDocument,node=doc?.getElementById(h.id),win=doc?.defaultView;if(!node||!win)return;
  event.preventDefault();setActive(h.id);setOpen(false);
  cancelJump.current();
  const frame=win.requestAnimationFrame(()=>{
   const target=doc.getElementById(h.id);if(!target)return;
   const header=doc.querySelector('.site-header')?.getBoundingClientRect().height||76;
   const closingSpace=rail.current?.querySelector<HTMLElement>('.toc-narrow')?.getBoundingClientRect().height||0;
   if(!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');
   target.focus({preventScroll:true});
   win.scrollTo({top:win.scrollY+target.getBoundingClientRect().top-closingSpace-header-24,behavior:reducedMotion()?'auto':'smooth'});
  });
  cancelJump.current=()=>win.cancelAnimationFrame(frame);
  try{win.history.replaceState(win.history.state,'',`#${h.id}`);}catch{/* Embedded editor previews can restrict history. */}
 }}><span className="toc-entry-title">{h.title}</span></a>)}</nav>;
 const settings=(compact=false)=>!preview&&!settingsInHeader&&<ReadingSettingsTrigger compact={compact}/>;
 if(!headings.length&&(preview||settingsInHeader))return null;
 return <aside ref={rail} className={`article-rail${headings.length?'':' article-rail-settings-only'}`} data-reading-ignore onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();setOpen(false);rail.current?.querySelector<HTMLButtonElement>('.reading-directory-toggle')?.focus({preventScroll:true});}}}>
  <div className="toc-in">{!!headings.length&&<><div className="toc-label">本文目录</div>{links}</>}{settings()}</div>
  <div className="article-reading-toolbar">{headings.length?<button type="button" className="reading-directory-toggle" aria-expanded={open} aria-controls="article-narrow-directory" onClick={()=>setOpen(value=>!value)}>目录 <MotionChevron open={open}/></button>:<span/>}{settings(true)}</div>
  {!!headings.length&&<MotionDisclosure id="article-narrow-directory" className="toc-narrow" open={open}>{links}</MotionDisclosure>}
 </aside>;
}
