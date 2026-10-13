import {syncMotionPreference} from '../lib/motionPreference';
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {useLocation} from 'react-router-dom';
import {useMoonTheme} from '../context/ThemeContext';
import * as Dialog from '@radix-ui/react-dialog';
import {Pause,Play,Square,X} from 'lucide-react';
import '../../styles/reading.css';

const colors=[['auto','跟随主题'],['paper','暖纸色'],['dark','深色'],['contrast','高对比']] as const;
type ReadingColor=typeof colors[number][0];
const defaults={size:0,color:'auto' as ReadingColor,reduceMotion:false};
const useClientLayoutEffect=typeof window==='undefined'?useEffect:useLayoutEffect;
function load(){
 try{
  const value=JSON.parse(localStorage.getItem('mooncci-reading')||'{}');
  return {reduceMotion:value.reduceMotion===true,size:[16,18,20,22,24].includes(value.size)?value.size:0,
   color:colors.some(([key])=>key===value.color)?value.color as ReadingColor:'auto' as ReadingColor};
 }catch{return defaults;}
}
export default function ReadingTools(){
 const location=useLocation(),{setTheme}=useMoonTheme();
 const active=!/^\/(admin|login|register|account|auth|forgot-password|reset-password)(\/|$)/.test(location.pathname);
 const article=/^\/article\/[^/]+\/?$/.test(location.pathname);
 const [prefs,setPrefs]=useState(load),[open,setOpen]=useState(false),[narrow,setNarrow]=useState(false);
 const [speech,setSpeech]=useState<'idle'|'speaking'|'paused'>('idle');
 const [message,setMessage]=useState(''),[progress,setProgress]=useState('');
 const [position,setPosition]=useState<{left:number;top:number}|null>(null);
 const anchor=useRef<HTMLElement|null>(null),panel=useRef<HTMLDivElement>(null),closeButton=useRef<HTMLButtonElement>(null);
 const generation=useRef(0),utterance=useRef<SpeechSynthesisUtterance|null>(null);
 const supported=typeof window!=='undefined'&&'speechSynthesis' in window&&'SpeechSynthesisUtterance' in window;
 function stop(){generation.current++;if(supported)window.speechSynthesis.cancel();utterance.current=null;setSpeech('idle');setProgress('');}
 useEffect(()=>{
  const media=window.matchMedia('(max-width:1279px)');
  const update=()=>{setNarrow(media.matches);setOpen(false);};
  update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);
 },[]);
 useEffect(()=>{
  const show=(event:Event)=>{
   if(!article)return;
   const trigger=(event as CustomEvent<{trigger?:HTMLElement}>).detail?.trigger||document.activeElement;
   if(!(trigger instanceof HTMLElement))return;
   const same=anchor.current===trigger;anchor.current=trigger;setPosition(null);setOpen(current=>same?!current:true);
  };
  const themeChanged=()=>setPrefs(current=>({...current,color:'auto'}));
  const menuChanged=(event:Event)=>{if((event as CustomEvent).detail?.open)setOpen(false);};
  window.addEventListener('mooncci:reading-tools-open',show);window.addEventListener('mooncci:theme-toggle',themeChanged);window.addEventListener('mooncci:menu-state',menuChanged);
  return()=>{window.removeEventListener('mooncci:reading-tools-open',show);window.removeEventListener('mooncci:theme-toggle',themeChanged);window.removeEventListener('mooncci:menu-state',menuChanged);};
 },[article]);
 useEffect(()=>{
  setOpen(false);stop();setMessage('');
  return()=>{generation.current++;if(supported)window.speechSynthesis.cancel();};
 },[location.pathname,location.search]);
 useEffect(()=>{
  const root=document.documentElement;
  if(active){root.dataset.readingColor=prefs.color;if(prefs.size)root.style.setProperty('--reading-size',`${prefs.size}px`);else root.style.removeProperty('--reading-size');}
  try{localStorage.setItem('mooncci-reading',JSON.stringify(prefs));}catch{/* Preferences still work for this page. */}
  syncMotionPreference();
  return()=>{delete root.dataset.readingColor;root.style.removeProperty('--reading-size');};
 },[prefs,active]);
 useEffect(()=>{if(prefs.color!=='auto')setTheme(prefs.color==='paper'?'light':'dark');},[prefs.color,setTheme]);
 useEffect(()=>{
  document.body.classList.toggle('rs-visible',open);document.body.classList.toggle('rs-open',open&&narrow);
  window.dispatchEvent(new CustomEvent('mooncci:reading-tools-state',{detail:{open}}));
  return()=>{document.body.classList.remove('rs-visible','rs-open');};
 },[open,narrow]);
 useClientLayoutEffect(()=>{
  if(!open||narrow)return;
  const place=()=>{
   if(!anchor.current||!panel.current)return;
   const bounds=anchor.current.getBoundingClientRect(),width=panel.current.offsetWidth,height=panel.current.offsetHeight;
   const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(value,max));
   let left=bounds.left-width-12,top=bounds.top+(bounds.height-height)/2;
   if(left<16){left=clamp(bounds.right-width,16,window.innerWidth-width-16);top=bounds.bottom+12;if(top+height>window.innerHeight-16)top=bounds.top-height-12;}
   setPosition({left,top:clamp(top,16,window.innerHeight-height-16)});
  };
  const closeOnScroll=()=>setOpen(false);
  place();const frame=requestAnimationFrame(place);window.addEventListener('resize',place);window.addEventListener('scroll',closeOnScroll,{passive:true});
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',place);window.removeEventListener('scroll',closeOnScroll);};
 },[open,narrow]);
 function changeColor(color:ReadingColor){setPrefs(current=>({...current,color}));}
 function colorKeys(event:ReactKeyboardEvent<HTMLDivElement>){
  const index=colors.findIndex(([key])=>key===prefs.color);
  const next=event.key==='Home'?0:event.key==='End'?colors.length-1:['ArrowRight','ArrowDown'].includes(event.key)?(index+1)%colors.length:['ArrowLeft','ArrowUp'].includes(event.key)?(index+colors.length-1)%colors.length:null;
  if(next===null)return;event.preventDefault();changeColor(colors[next][0]);event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=radio]')[next]?.focus();
 }
 function read(){
  stop();setMessage('');
  const source=document.querySelector<HTMLElement>('[data-reading-content]');
  if(!source){setMessage('请打开一篇文章、近况或作品详情后朗读。');return;}
  const parts=Array.from(source.querySelectorAll<HTMLElement>('h1,h2,h3,h4,p,li,blockquote'))
   .filter(el=>!el.closest('[data-reading-ignore],.eyebrow,nav,pre')&&el.getClientRects().length&&!el.querySelector('p,li,blockquote'))
   .map(el=>el.innerText.trim()).filter(Boolean);
  const chunks=parts.flatMap(text=>text.match(/[^。！？.!?\n]{1,180}[。！？.!?\n]?/gu)||[text]);
  if(!chunks.length){setMessage('当前没有可朗读的正文。');return;}
  const run=generation.current;
  const next=(i:number)=>{
   if(run!==generation.current)return;
   if(i>=chunks.length){setSpeech('idle');setProgress('朗读完成');return;}
   const item=new SpeechSynthesisUtterance(chunks[i]);utterance.current=item;
   item.lang='zh-CN';item.rate=1;
   item.onend=()=>next(i+1);
   item.onerror=()=>{if(run===generation.current){setSpeech('idle');setMessage('朗读未能继续，请检查设备语音支持后重试。');}};
   setSpeech('speaking');setProgress(`${i+1} / ${chunks.length}`);window.speechSynthesis.speak(item);
  };
  next(0);
 }
 if(!article)return null;
 const panelStyle:CSSProperties|undefined=narrow?undefined:{left:position?.left??16,top:position?.top??16,visibility:position?'visible':'hidden'};
 return <Dialog.Root open={open} onOpenChange={setOpen} modal={narrow}>
  <Dialog.Portal>
   {narrow&&<Dialog.Overlay className="rs-overlay"/>}
   <Dialog.Content ref={panel} id="reading-settings-panel" className="rs-panel" data-layout={narrow?'sheet':'popover'} style={panelStyle} aria-modal={narrow||undefined} aria-describedby={undefined}
    onOpenAutoFocus={event=>{event.preventDefault();closeButton.current?.focus({preventScroll:true});}}
    onCloseAutoFocus={event=>{event.preventDefault();if(anchor.current?.isConnected)anchor.current.focus({preventScroll:true});}}
    onInteractOutside={event=>{if(anchor.current?.contains(event.target as Node))event.preventDefault();}}>
    {narrow&&<div className="rs-handle" aria-hidden="true"/>}
    <div className="rs-heading"><Dialog.Title>阅读设置</Dialog.Title><Dialog.Close ref={closeButton} className="rs-close" aria-label="收起阅读设置"><X size={18}/></Dialog.Close></div>
    <section className="rs-font-section" aria-labelledby="rs-font-label">
     <div className="rs-label-row"><span id="rs-font-label">正文字号</span><output htmlFor="rs-font-range">{prefs.size?`${prefs.size}px`:'默认'}</output></div>
     <div className="rs-font-control"><span aria-hidden="true">A</span><input id="rs-font-range" type="range" min="16" max="24" step="2" value={prefs.size||18} aria-label="正文字号" onChange={event=>setPrefs(current=>({...current,size:Number(event.target.value)}))}/><span aria-hidden="true">A</span></div>
    </section>
    <section className="rs-color-section" aria-labelledby="rs-color-label">
     <div className="rs-label" id="rs-color-label">页面配色</div>
     <div className="rs-swatches" role="radiogroup" aria-labelledby="rs-color-label" onKeyDown={colorKeys}>{colors.map(([color,label])=><button key={color} type="button" role="radio" aria-checked={prefs.color===color} tabIndex={prefs.color===color?0:-1} className="rs-swatch" data-color={color} onClick={()=>changeColor(color)}><span className="rs-color-sample" aria-hidden="true">Aa</span><span>{label}</span></button>)}</div>
    </section>
    <div className="rs-row-controls">
     <div className="rs-row"><div><div className="rs-row-title">减少动态效果</div><p className="rs-hint">在系统设置基础上进一步减少</p></div><button className="rs-switch" type="button" role="switch" aria-label="减少动态效果" aria-checked={prefs.reduceMotion} onClick={()=>setPrefs(current=>({...current,reduceMotion:!current.reduceMotion}))}><span className="rs-switch-track"><span className="rs-switch-knob"/></span></button></div>
     <div className="rs-row"><span className="rs-row-title">朗读正文</span>{supported?<div className="rs-speech-actions">{speech==='idle'?<button type="button" className="rs-soft-button" onClick={read}><Play size={12} fill="currentColor"/>开始朗读</button>:<><button type="button" className="rs-soft-button" onClick={stop}><Square size={12} fill="currentColor"/>停止朗读</button><button type="button" className="rs-speech-pause" aria-label={speech==='paused'?'继续朗读':'暂停朗读'} title={speech==='paused'?'继续朗读':'暂停朗读'} onClick={()=>{if(speech==='paused'){window.speechSynthesis.resume();setSpeech('speaking');}else{window.speechSynthesis.pause();setSpeech('paused');}}}>{speech==='paused'?<Play size={16}/>:<Pause size={16}/>}</button></>}</div>:<span className="rs-hint">此浏览器不支持朗读，可使用系统朗读功能。</span>}</div>
    </div>
    {(message||progress)&&<p className="rs-status" role="status">{message||progress}</p>}
    <div className="rs-footer"><button type="button" onClick={()=>{setPrefs(defaults);stop();setMessage('已恢复默认设置');}}>恢复默认</button><span>设置会自动记住</span></div>
   </Dialog.Content>
  </Dialog.Portal>
 </Dialog.Root>;
}
