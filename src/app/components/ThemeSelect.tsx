import { Children, cloneElement, isValidElement, useId, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import '../../styles/choice-group.css';
type Props = {
  value:string; onValueChange:(value:string)=>void; children:ReactNode;
  'aria-label'?:string; 'aria-labelledby'?:string; 'aria-describedby'?:string;
  id?:string; name?:string; required?:boolean; allowEmpty?:boolean; disabled?:boolean; className?:string;
};
function optionText(node:ReactNode):string {return Children.toArray(node).map(child=>isValidElement<{children?:ReactNode}>(child)?optionText(child.props.children):String(child)).join('');}
// Short lists stay visible; longer lists retain native selection and validation.
export function ThemeSelect({value,onValueChange,children,required,allowEmpty=false,name,disabled,className='',...props}:Props){
 const id=useId(),root=useRef<HTMLSpanElement>(null),[invalid,setInvalid]=useState(false);
 const options=Children.toArray(children).filter(isValidElement<{value:string;children:ReactNode;disabled?:boolean}>).filter(o=>allowEmpty||o.props.value!=='');
 const focusValue=options.some(o=>o.props.value===value&&!o.props.disabled)?value:options.find(o=>!o.props.disabled)?.props.value;
 const choose=(next:string)=>{setInvalid(false);onValueChange(next);};
 const describedBy=[props['aria-describedby'],invalid?`${id}-error`:''].filter(Boolean).join(' ')||undefined;
 return <span ref={root} className={`choice-field ${className}`} onInvalidCapture={event=>{event.preventDefault();setInvalid(true);const target=event.target as HTMLSelectElement;if(!target.form||Array.from(target.form.elements).find(control=>(control as HTMLInputElement).validity?.valid===false)===target)queueMicrotask(()=>root.current?.querySelector<HTMLElement>('select.choice-native,button[role="radio"]:not(:disabled)')?.focus());}}>
  {options.length>7?<select {...props} className="choice-native" name={name} required={required} disabled={disabled} value={value} aria-invalid={invalid||undefined} aria-describedby={describedBy} onChange={event=>choose(event.target.value)}>{Children.map(children,child=>!allowEmpty&&isValidElement<{value:string;disabled?:boolean;hidden?:boolean}>(child)&&child.props.value===''?cloneElement(child,{disabled:true,hidden:true}):child)}</select>:<>
  <span {...props} role="radiogroup" aria-required={required||undefined} aria-invalid={invalid||undefined} aria-describedby={describedBy} className="choice-options">
   {options.map(option=><button key={option.props.value} type="button" role="radio" aria-label={optionText(option.props.children)} aria-checked={option.props.value===value} disabled={disabled||option.props.disabled} tabIndex={option.props.value===focusValue?0:-1} onClick={()=>choose(option.props.value)} onKeyDown={event=>{
    if(!['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(event.key))return;
    const buttons=Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button[role="radio"]')).filter(button=>!button.matches(':disabled'));
    if(!buttons.length)return;event.preventDefault();const index=buttons.indexOf(event.currentTarget),step=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+step+buttons.length)%buttons.length;buttons[next].focus();buttons[next].click();
   }}><span className="choice-caption"><Check size={14} aria-hidden="true" className="choice-mark"/><span>{option.props.children}</span></span></button>)}
  </span>
  {!options.length&&<span className="choice-empty" role="status">没有匹配的选项。</span>}
  <select className="theme-select-native" aria-hidden="true" tabIndex={-1} name={name} required={required} disabled={disabled} value={value} onChange={event=>choose(event.target.value)}>{children}</select>
  </>}
  {invalid&&<span id={`${id}-error`} role="alert" className="choice-error">请选择一项。</span>}
 </span>;
}
