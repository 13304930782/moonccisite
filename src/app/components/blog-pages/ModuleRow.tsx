import { useI18n } from '../../i18n';
import {useState,type ReactNode} from 'react';
import {Switch} from './Switch';
import {ABOUT_MODULE_KEYS,type AboutData,type AboutModuleKey} from '../AboutContent';
import {moveItem} from './SortableList';
export type ModuleKey=AboutModuleKey;
export const moduleLabels:Record<ModuleKey,string>={story:'关于这个博客',activities:'我在做什么',technologies:'常用技术',timeline:'时间线',social:'找到我'};
export const moduleKeys=[...ABOUT_MODULE_KEYS];
export function ModuleRow({module,about,handle,onChange}:{module:ModuleKey;about:AboutData;handle:ReactNode;onChange:(key:string,value:unknown)=>void}){
  const { t } = useI18n();
 const [open,setOpen]=useState(false);
 const editable=module==='activities'||module==='timeline';
 const rows=module==='activities'?about.activities||[]:module==='timeline'?about.timeline||[]:[];
 const hasContent=module==='story'?!!about.content.trim():module==='technologies'?!!about.technologies?.length:module==='social'?about.social.some(x=>x.enabled!==false&&x.name.trim()&&x.url.trim()):rows.some(x=>x.enabled!==false&&('title' in x?x.title.trim():x.date.trim()&&x.description.trim()));
 const enabled=about.sections?.[module]!==false;
 return <div className="bp-module" data-enabled={enabled} onInvalid={()=>setOpen(true)}>
  <div className="bp-module-row">{handle}<input className="bp-module-title" aria-label={t("m_ae2c896867", {v0: t(moduleLabels[module])})} maxLength={60} value={about.headings?.[module]??moduleLabels[module]} onChange={e=>onChange('headings',{...about.headings,[module]:e.target.value})}/>
   {!hasContent&&<span className="bp-badge">{t("m_610b0b2090")}</span>}{editable&&<button type="button" aria-expanded={open} aria-controls={`bp-items-${module}`} onClick={()=>setOpen(!open)}>{open?t("m_afd4b78353"):t("m_2203dc909a")}</button>}
   <Switch label={t("m_0a60bcc436", {v0: t(moduleLabels[module])})} checked={enabled} onChange={value=>onChange('sections',{...about.sections,[module]:value})}/>
  </div>
  {editable&&<div id={`bp-items-${module}`} className="bp-module-items" hidden={!open}>
   {rows.map((row,index)=><fieldset className="bp-item-card" key={index}><legend>{module==='activities'?t("m_79f326be44"):t("m_2d10603346")} {index+1}</legend><div className="bp-item-fields">
    {(module==='activities'?['title','description','url']:['date','description']).map(key=><label className="bp-field" key={key}>{({title:t("m_c3405f8c7d"),description:module==='activities'?t("m_17f18edd57"):t("m_c560201b33"),url:t("m_bd673c7a30"),date:t("m_8b6ff49851")} as Record<string,string>)[key]}<input required={key==='title'||key==='date'||(module==='timeline'&&key==='description')} maxLength={key==='description'?500:key==='url'?2048:key==='date'?60:100} value={String((row as unknown as Record<string,unknown>)[key]||'')} onChange={e=>onChange(module,rows.map((item,i)=>i===index?{...item,[key]:e.target.value}:item))}/></label>)}
   </div><div className="bp-item-actions">{[-1,1].map(delta=><button type="button" key={delta} disabled={index+delta<0||index+delta>=rows.length} aria-label={t("m_8b88711021", {v0: delta<0?t("m_f853a70b12"):t("m_e75e8b4e5c"), v1: t(moduleLabels[module]), v2: index+1})} onClick={()=>onChange(module,moveItem<(typeof rows)[number]>(rows,index,index+delta))}>{delta<0?t("m_e39c752417"):t("m_720fa80205")}</button>)}<span>{t("m_c0ef4fdeca")}</span><Switch label={t("m_7a873f6743", {v0: t(moduleLabels[module]), v1: index+1})} checked={row.enabled!==false} onChange={value=>onChange(module,rows.map((item,i)=>i===index?{...item,enabled:value}:item))}/><button type="button" aria-label={t("m_597a19940a", {v0: t(moduleLabels[module]), v1: index+1})} onClick={()=>onChange(module,rows.filter((_,i)=>i!==index))}>{t("m_2f9daa8289")}</button></div></fieldset>)}
   <button type="button" disabled={rows.length>=(module==='activities'?12:30)} onClick={()=>onChange(module,[...rows,module==='activities'?{title:'',description:'',url:'',enabled:true}:{date:'',description:'',enabled:true}])}>{t("m_45cf7c95bf")}{module==='activities'?t("m_79f326be44"):t("m_2d10603346")}</button>
  </div>}
 </div>;
}
