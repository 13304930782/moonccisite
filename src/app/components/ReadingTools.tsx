import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { Accessibility, X } from 'lucide-react';
import '../../styles/reading.css';

const colors = [['auto', '跟随主题'], ['paper', '暖纸色'], ['dark', '深色'], ['contrast', '高对比']] as const;
const defaults = { size: 18, color: 'auto' };
function load() {
  try {
    const value = JSON.parse(localStorage.getItem('mooncci-reading') || '{}');
    return { size: [16,18,20,22,24].includes(value.size) ? value.size : 18,
      color: colors.some(([key]) => key === value.color) ? value.color : 'auto' };
  } catch { return defaults; }
}
export default function ReadingTools() {
  const location = useLocation();
  const active = !/^\/(admin|login|register|account|auth|forgot-password|reset-password)(\/|$)/.test(location.pathname);
  const [prefs, setPrefs] = useState(load), [open, setOpen] = useState(false);
  const [speech, setSpeech] = useState<'idle'|'speaking'|'paused'>('idle');
  const [message, setMessage] = useState(''), [progress, setProgress] = useState('');
  const generation = useRef(0), utterance = useRef<SpeechSynthesisUtterance|null>(null);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  function stop() { generation.current++; if(supported) window.speechSynthesis.cancel(); utterance.current=null; setSpeech('idle'); setProgress(''); }
  useEffect(() => {
    setOpen(false); stop(); setMessage('');
    return () => { generation.current++; if(supported) window.speechSynthesis.cancel(); };
  }, [location.pathname, location.search]);
  useEffect(() => {
    const root = document.documentElement;
    if(active) { root.dataset.readingColor=prefs.color; root.style.setProperty('--reading-size', `${prefs.size}px`); }
    try { localStorage.setItem('mooncci-reading', JSON.stringify(prefs)); } catch { /* Preferences still work for this page. */ }
    return () => { delete root.dataset.readingColor; root.style.removeProperty('--reading-size'); };
  }, [prefs, active]);
  function read() {
    stop(); setMessage('');
    const source = document.querySelector<HTMLElement>('[data-reading-content]');
    if(!source) { setMessage('请打开一篇文章、近况或作品详情后朗读。'); return; }
    const parts = Array.from(source.querySelectorAll<HTMLElement>('h1,h2,h3,h4,p,li,blockquote'))
      .filter(el => !el.closest('[data-reading-ignore],.eyebrow,nav,pre') && el.getClientRects().length && !el.querySelector('p,li,blockquote'))
      .map(el => el.innerText.trim()).filter(Boolean);
    const chunks = parts.flatMap(text => text.match(/[^。！？.!?\n]{1,180}[。！？.!?\n]?/gu) || [text]);
    if(!chunks.length) { setMessage('当前没有可朗读的正文。'); return; }
    const run = generation.current;
    const next = (i:number) => {
      if(run !== generation.current) return;
      if(i>=chunks.length) { setSpeech('idle'); setProgress('朗读完成'); return; }
      const item = new SpeechSynthesisUtterance(chunks[i]); utterance.current=item;
      item.lang='zh-CN'; item.rate=1;
      item.onend=()=>next(i+1);
      item.onerror=()=>{ if(run===generation.current){setSpeech('idle');setMessage('朗读未能继续，请检查设备语音支持后重试。');} };
      setSpeech('speaking'); setProgress(`${i+1} / ${chunks.length}`); window.speechSynthesis.speak(item);
    };
    next(0);
  }
  if(!active) return null;
  return <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
    <Dialog.Trigger className="reading-tools-trigger" aria-label="阅读与无障碍设置"><Accessibility size={21}/><span>阅读设置</span></Dialog.Trigger>
    <Dialog.Portal><Dialog.Content className="reading-tools-panel" onInteractOutside={e=>e.preventDefault()}>
      <div className="reading-tools-heading"><Dialog.Title>阅读设置</Dialog.Title><Dialog.Close aria-label="收起阅读设置"><X size={20}/></Dialog.Close></div>
      <Dialog.Description>调整当前设备的阅读体验，设置会自动记住。</Dialog.Description>
      <fieldset><legend>正文字号</legend><div className="reading-options">{[16,18,20,22,24].map(size=><button key={size} aria-pressed={prefs.size===size} onClick={()=>setPrefs({...prefs,size})}>{size}</button>)}</div></fieldset>
      <fieldset><legend>页面配色</legend><div className="reading-options">{colors.map(([color,label])=><button key={color} aria-pressed={prefs.color===color} onClick={()=>setPrefs({...prefs,color})}>{label}</button>)}</div></fieldset>
      <fieldset><legend>朗读正文</legend>{supported?<div className="reading-options">
        {speech==='idle'?<button onClick={read}>开始朗读</button>:<><button onClick={()=>{if(speech==='paused'){window.speechSynthesis.resume();setSpeech('speaking');}else{window.speechSynthesis.pause();setSpeech('paused');}}}>{speech==='paused'?'继续朗读':'暂停朗读'}</button><button onClick={stop}>停止</button></>}
      </div>:<p>此浏览器不支持朗读，可使用系统朗读功能。</p>}<p role="status">{message || progress}</p></fieldset>
      <button className="text-link" onClick={()=>{setPrefs(defaults);stop();setMessage('已恢复默认设置');}}>恢复默认</button>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
