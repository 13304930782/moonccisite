import {X} from 'lucide-react';
import './TagInput.css';
export function TagInput({id,tags,value,onInput,onCommit,onRemove}:{id:string;tags:string[];value:string;onInput:(value:string)=>void;onCommit:(value:string)=>void;onRemove:(index:number)=>void}){
 return <div className="writing-tags">{tags.map((tag,index)=><span className="writing-tag" key={`${tag}:${index}`}>{tag}<button type="button" aria-label={`移除标签 ${tag}`} onClick={()=>onRemove(index)}><X size={12} aria-hidden="true"/></button></span>)}<input id={id} value={value} placeholder="输入后按回车添加，用逗号分隔" onChange={event=>{const next=event.target.value;if(/[,，]/.test(next)&&!(event.nativeEvent as InputEvent).isComposing)onCommit(next);else onInput(next);}} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();onCommit(value);}}} onBlur={()=>onCommit(value)} className="ui-input"/></div>;
}
