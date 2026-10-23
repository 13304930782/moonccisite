import {X} from 'lucide-react';
import './TagInput.css';

type TagInputProps={id:string;tags:string[];value:string;onInput:(value:string)=>void;onCommit:(value:string)=>void;onRemove:(index:number)=>void;maxTags?:number;emptyBackspace?:boolean};
export function TagInput({id,tags,value,onInput,onCommit,onRemove,maxTags,emptyBackspace=false}:TagInputProps){
 const full=maxTags!==undefined&&tags.length>=maxTags;
 return <div className="writing-tags" data-full={full||undefined}>{tags.map((tag,index)=><span className="writing-tag" key={`${tag}:${index}`}>{tag}<button type="button" aria-label={`移除标签 ${tag}`} onClick={()=>onRemove(index)}><X size={12} aria-hidden="true"/></button></span>)}<input id={id} value={value} disabled={full} aria-describedby={maxTags===undefined?undefined:`${id}-count`} placeholder={full?'已达到标签上限':'输入后按回车添加，用逗号分隔'} onChange={event=>{const next=event.target.value;if(/[,，]/.test(next)&&!(event.nativeEvent as InputEvent).isComposing)onCommit(next);else onInput(next);}} onKeyDown={event=>{if(event.nativeEvent.isComposing)return;if(event.key==='Enter'){event.preventDefault();onCommit(value);}else if(emptyBackspace&&event.key==='Backspace'&&!value&&tags.length){event.preventDefault();onRemove(tags.length-1);}}} onBlur={()=>onCommit(value)} className="ui-input"/>{maxTags!==undefined&&<span className="bp-tag-count" id={`${id}-count`} role="status">{tags.length} / {maxTags}{full?' · 已达上限':''}</span>}</div>;
}
