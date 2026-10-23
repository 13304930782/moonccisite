import {useState,type ReactNode} from 'react';
import {Switch} from './Switch';
import {ABOUT_MODULE_KEYS,type AboutData,type AboutModuleKey} from '../AboutContent';
import {moveItem} from './SortableList';
export type ModuleKey=AboutModuleKey;
export const moduleLabels:Record<ModuleKey,string>={story:'关于这个博客',activities:'我在做什么',technologies:'常用技术',timeline:'时间线',social:'找到我'};
export const moduleKeys=[...ABOUT_MODULE_KEYS];
export function ModuleRow({module,about,handle,onChange}:{module:ModuleKey;about:AboutData;handle:ReactNode;onChange:(key:string,value:unknown)=>void}){
 const [open,setOpen]=useState(false);
 const editable=module==='activities'||module==='timeline';
 const rows=module==='activities'?about.activities||[]:module==='timeline'?about.timeline||[]:[];
 const hasContent=module==='story'?!!about.content.trim():module==='technologies'?!!about.technologies?.length:module==='social'?about.social.some(x=>x.enabled!==false&&x.name.trim()&&x.url.trim()):rows.some(x=>x.enabled!==false&&('title' in x?x.title.trim():x.date.trim()&&x.description.trim()));
 const enabled=about.sections?.[module]!==false;
 return <div className="bp-module" data-enabled={enabled} onInvalid={()=>setOpen(true)}>
  <div className="bp-module-row">{handle}<input className="bp-module-title" aria-label={`${moduleLabels[module]}模块标题`} maxLength={60} value={about.headings?.[module]??moduleLabels[module]} onChange={e=>onChange('headings',{...about.headings,[module]:e.target.value})}/>
   {!hasContent&&<span className="bp-badge">无内容·不显示</span>}{editable&&<button type="button" aria-expanded={open} aria-controls={`bp-items-${module}`} onClick={()=>setOpen(!open)}>{open?'收起':'编辑内容'}</button>}
   <Switch label={`显示${moduleLabels[module]}`} checked={enabled} onChange={value=>onChange('sections',{...about.sections,[module]:value})}/>
  </div>
  {editable&&<div id={`bp-items-${module}`} className="bp-module-items" hidden={!open}>
   {rows.map((row,index)=><fieldset className="bp-item-card" key={index}><legend>{module==='activities'?'项目':'时间点'} {index+1}</legend><div className="bp-item-fields">
    {(module==='activities'?['title','description','url']:['date','description']).map(key=><label className="bp-field" key={key}>{({title:'标题',description:module==='activities'?'简述':'事件',url:'链接（可选，支持站内路径）',date:'时间'} as Record<string,string>)[key]}<input required={key==='title'||key==='date'||(module==='timeline'&&key==='description')} maxLength={key==='description'?500:key==='url'?2048:key==='date'?60:100} value={String((row as unknown as Record<string,unknown>)[key]||'')} onChange={e=>onChange(module,rows.map((item,i)=>i===index?{...item,[key]:e.target.value}:item))}/></label>)}
   </div><div className="bp-item-actions">{[-1,1].map(delta=><button type="button" key={delta} disabled={index+delta<0||index+delta>=rows.length} aria-label={`${delta<0?'上移':'下移'}${moduleLabels[module]}条目 ${index+1}`} onClick={()=>onChange(module,moveItem<(typeof rows)[number]>(rows,index,index+delta))}>{delta<0?'↑ 上移':'↓ 下移'}</button>)}<span>公开显示</span><Switch label={`公开显示${moduleLabels[module]}条目 ${index+1}`} checked={row.enabled!==false} onChange={value=>onChange(module,rows.map((item,i)=>i===index?{...item,enabled:value}:item))}/><button type="button" aria-label={`删除${moduleLabels[module]}条目 ${index+1}`} onClick={()=>onChange(module,rows.filter((_,i)=>i!==index))}>删除</button></div></fieldset>)}
   <button type="button" disabled={rows.length>=(module==='activities'?12:30)} onClick={()=>onChange(module,[...rows,module==='activities'?{title:'',description:'',url:'',enabled:true}:{date:'',description:'',enabled:true}])}>＋ 添加{module==='activities'?'项目':'时间点'}</button>
  </div>}
 </div>;
}
