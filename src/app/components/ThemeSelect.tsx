import { Children, isValidElement, useId, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import '../../styles/choice-group.css';
type Props = {
  value:string; onValueChange:(value:string)=>void; children:ReactNode;
  'aria-label'?:string; 'aria-labelledby'?:string; 'aria-describedby'?:string;
  id?:string; name?:string; required?:boolean; allowEmpty?:boolean; disabled?:boolean; className?:string;
};
function optionText(node:ReactNode):string {return Children.toArray(node).map(child=>isValidElement<{children?:ReactNode}>(child)?optionText(child.props.children):String(child)).join('');}
// Visible choices preserve the existing value and form-validation contract.
export function ThemeSelect({value,onValueChange,children,required,allowEmpty=false,name,disabled,className='',...props}:Props){
 const id=useId(),root=useRef<HTMLSpanElement>(null),[query,setQuery]=useState(''),[invalid,setInvalid]=useState(false);
 const options=Children.toArray(children).filter(isValidElement<{value:string;children:ReactNode;disabled?:boolean}>).filter(o=>allowEmpty||o.props.value!=='');
 const visible=options.filter(o=>optionText(o.props.children).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const focusValue=visible.some(o=>o.props.value===value&&!o.props.disabled)?value:visible.find(o=>!o.props.disabled)?.props.value;
 const label=props['aria-label']||'选择选项';
 const choose=(next:string)=>{setInvalid(false);onValueChange(next);};
 return <span ref={root} className={`choice-field ${className}`} onInvalidCapture={event=>{event.preventDefault();setInvalid(true);setQuery('');const target=event.target as HTMLSelectElement;if(target.form?.querySelector(':invalid')===target)queueMicrotask(()=>root.current?.querySelector<HTMLButtonElement>('button[role="radio"]:not(:disabled)')?.focus());}}>
  {options.length>12&&<span className="choice-search"><input type="search" value={query} disabled={disabled} aria-label={`查找${label}`} placeholder="查找选项" onChange={event=>setQuery(event.target.value)}/></span>}
  <span {...props} role="radiogroup" aria-required={required||undefined} aria-invalid={invalid||undefined} aria-describedby={invalid?`${id}-error`:props['aria-describedby']} className={`choice-options${options.length>7?' choice-options--many':''}`}>
   {visible.map(option=><button key={option.props.value} type="button" role="radio" aria-label={optionText(option.props.children)} aria-checked={option.props.value===value} disabled={disabled||option.props.disabled} tabIndex={option.props.value===focusValue?0:-1} onClick={()=>choose(option.props.value)} onKeyDown={event=>{
    if(!['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(event.key))return;
    const buttons=Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button[role="radio"]')).filter(button=>!button.matches(':disabled'));
    if(!buttons.length)return;event.preventDefault();const index=buttons.indexOf(event.currentTarget),step=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+step+buttons.length)%buttons.length;buttons[next].focus();buttons[next].click();
   }}><span className="choice-caption"><Check size={14} aria-hidden="true" className="choice-mark"/><span>{option.props.children}</span></span></button>)}
  </span>
  {!visible.length&&<span className="choice-empty" role="status">没有匹配的选项。</span>}
  <select className="theme-select-native" aria-hidden="true" tabIndex={-1} name={name} required={required} disabled={disabled} value={value} onChange={event=>choose(event.target.value)}>{children}</select>
  {invalid&&<span id={`${id}-error`} role="alert" className="choice-error">请选择一项。</span>}
 </span>;
}
