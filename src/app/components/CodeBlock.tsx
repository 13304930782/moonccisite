import {highlightCode} from '../lib/codeHighlight';
import {Children,isValidElement,useMemo,useEffect,useRef,useState, type ReactNode} from 'react';
import {Check,Copy} from 'lucide-react';
import '../../styles/code-block.css';
export function CodeBlock({children}:{children:ReactNode}){
 const child=Children.toArray(children).find(isValidElement);
 const props=child?.props as {children?:ReactNode;className?:string}|undefined;
 const source=typeof props?.children==='string'?props.children:null;
 const hint=props?.className?.match(/language-([^\s]+)/)?.[1]||'';
 const highlighted=useMemo(()=>highlightCode(source||'',hint),[source,hint]);
 const pre=useRef<HTMLPreElement>(null),timer=useRef<ReturnType<typeof setTimeout>>(),alive=useRef(true);
 const [state,setState]=useState<'idle'|'copied'|'error'>('idle'),[busy,setBusy]=useState(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;clearTimeout(timer.current);};},[]);
 async function copy(){
  if(!pre.current||busy)return;
  const text=pre.current.querySelector('code')?.textContent??pre.current.textContent??'';
  setBusy(true);clearTimeout(timer.current);
  try{
   const doc=pre.current.ownerDocument,win=doc.defaultView;
   if(win?.navigator.clipboard?.writeText)await win.navigator.clipboard.writeText(text);
   else{
    const input=doc.createElement('textarea');input.value=text;input.setAttribute('readonly','');input.style.cssText='position:fixed;left:-9999px;top:0';const active=doc.activeElement as HTMLElement|null;doc.body.appendChild(input);
    try{input.select();if(!doc.execCommand('copy'))throw new Error('copy unavailable');}finally{input.remove();active?.focus();}
   }
   if(alive.current)setState('copied');
  }catch{if(alive.current)setState('error');}
  finally{if(alive.current){setBusy(false);timer.current=setTimeout(()=>setState('idle'),2500);}}
 }
 const label=state==='copied'?'已复制':state==='error'?'复制失败，请手动选择代码':'复制代码';
 return <div className="code-block"><span className="code-language" data-reading-ignore>{highlighted.label}{highlighted.automatic?' · 自动':''}</span><button type="button" className="code-copy" onClick={()=>void copy()} disabled={busy} aria-label={label} title={label} data-reading-ignore>{state==='copied'?<Check size={16}/>:<Copy size={16}/>}</button><span className={state==='error'?'code-copy-feedback':'sr-only'} role="status" aria-live="polite" data-reading-ignore>{state==='idle'?'':label}</span><pre ref={pre}>{source===null?children:highlighted.html===null?<code>{source}</code>:<code className="hljs" dangerouslySetInnerHTML={{__html:highlighted.html}}/>}</pre></div>;
}
