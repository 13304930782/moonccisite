import {useEffect,useRef,useState,type ReactNode} from 'react';
export function SecondaryActions({children}:{children:ReactNode}) {
  const ref=useRef<HTMLDetailsElement>(null),[open,setOpen]=useState(false);
  useEffect(()=>{
    if(!open)return;
    const close=(e:PointerEvent)=>{if(e.target instanceof Node&&!ref.current?.contains(e.target)&&ref.current)ref.current.open=false;};
    document.addEventListener('pointerdown',close);
    return()=>document.removeEventListener('pointerdown',close);
  },[open]);
  return <details ref={ref} className="secondary-actions" onToggle={e=>setOpen(e.currentTarget.open)} onKeyDown={e=>{if(e.key==='Escape'&&ref.current){e.preventDefault();ref.current.open=false;ref.current.querySelector('summary')?.focus();}}}>
    <summary>更多操作</summary><div className="secondary-actions-panel" onClick={e=>{if((e.target as Element).closest('button,a')&&ref.current)ref.current.open=false;}}>{children}</div>
  </details>;
}
