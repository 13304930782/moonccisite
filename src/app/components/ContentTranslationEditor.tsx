import '../../styles/content-translations.css';
import {Fragment,useEffect,useRef,useState} from 'react';
import {api} from '../lib/api';
import {useUnsavedLeave} from '../lib/useUnsavedLeave';
import {useI18n} from '../i18n';

type Props={type:'project'|'update'|'series'|'category'|'tag'|'now'|'site'|'blog_pages';id:string|number;source:Record<string,unknown>;title?:string;visibleGroups?:string[];onStateChange?:(state:{dirty:boolean;busy:boolean})=>void};
const fields:Record<Props['type'],string[]>={project:['name','summary','content'],update:['content'],series:['title','description'],category:['name'],tag:['name'],now:['content'],site:['brand','profile','hero','footer'],blog_pages:['about','links']};
const labels:Record<string,string>={name:'名称',title:'标题',summary:'简介',content:'正文',description:'描述',brand:'品牌',profile:'个人介绍',hero:'首页介绍',footer:'页脚',about:'关于我',links:'友情链接',intro:'简介',badges:'个人标签',technologies:'常用技术',activities:'我在做什么',timeline:'时间线',social:'找到我',headings:'模块标题',story:'关于这个博客',date:'日期',site_title:'网站标题',nav_title:'导航名称',bio:'个人简介',eyebrow:'小标题',badge:'标签',title_before:'标题前半段',title_highlight:'标题强调',title_after:'标题后半段',subtitle:'副标题',primary_text:'主要按钮文字',secondary_text:'次要按钮文字',copyright:'版权说明'};
const textKeys=new Set(['site_title','nav_title','name','title','bio','eyebrow','badge','title_before','title_highlight','title_after','subtitle','primary_text','secondary_text','copyright','intro','content','story','activities','technologies','timeline','social','date','description','summary','headings','badges']);
function textFields(source:unknown,path:string[]=[],top?:string[]):{path:string[];value:string}[]{
 if(typeof source==='string')return [{path,value:source}];
 if(Array.isArray(source))return source.flatMap((value,index)=>textFields(value,[...path,String(index)]));
 if(source&&typeof source==='object')return Object.entries(source).filter(([key])=>(top?top.includes(key):textKeys.has(key))).flatMap(([key,value])=>textFields(value,[...path,key]));
 return [];
}
const at=(data:any,path:string[])=>path.reduce((value,key)=>value?.[key],data);
function put(data:any,path:string[],value:string){const result=structuredClone(data);let target=result;for(let i=0;i<path.length-1;i++){target[path[i]]??=/^\d+$/.test(path[i+1])?[]:{};target=target[path[i]];}target[path.at(-1)!]=value;return result;}
export function ContentTranslationEditor(props:Props){
 const {t}=useI18n();const [open,setOpen]=useState(false);const taxonomy=props.type==='category'||props.type==='tag';
 return <details className="content-translation" onToggle={event=>{if(event.currentTarget.open)setOpen(true);}}><summary>{taxonomy ? <><span>{t(props.type==='category'?'分类':'标签')}</span><strong>{String(props.source.name||props.id)}</strong></> : t(props.title||"m_d33b69c467")}</summary>{open&&<TranslationFields key={props.type+':'+props.id} {...props}/>}</details>;
}
export function TranslationFields({type,id,source,visibleGroups,onStateChange}:Props){
 const {t,locale}=useI18n();const [row,setRow]=useState<any>(null),[draft,setDraft]=useState<any>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [attempt,setAttempt]=useState(0);const saving=useRef(false),alive=useRef(true);
 const taxonomy=type==='category'||type==='tag';
 const path='/settings/translations/'+type+'/'+encodeURIComponent(String(id));
 const dirty=!!row&&JSON.stringify(draft)!==JSON.stringify(row.draft);useUnsavedLeave(dirty);
 useEffect(()=>{onStateChange?.({dirty,busy});},[dirty,busy,onStateChange]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{const controller=new AbortController();setError('');api(path,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted){setRow(value);setDraft(value.draft);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[path,attempt]);
 async function save(action:'save'|'publish'|'withdraw'){
  if(!row||saving.current)return;saving.current=true;setBusy(true);setError('');setMessage('');
  try{const value=await api(path,{method:'PUT',body:JSON.stringify({draft,version:row.version,action})});if(!alive.current)return;setRow({...value,source:value.source||row.source});setDraft(value.draft);setMessage(action==='save'?t("m_ed6341cbd5"):action==='publish'?t("m_d5f7b21596"):t("m_f44e5d7f79"));}
  catch(e:any){if(alive.current)setError(e.message);}finally{saving.current=false;if(alive.current)setBusy(false);}
 }
 return <section className="translation-fields" aria-label={t("m_d33b69c467")}>
  <p className="translation-description">{t("m_1efd7f94f9")}</p>
  {visibleGroups&&<p className="translation-description">{locale==='en'?'All site sections share one English draft. Save, publish, withdraw and discard apply to the entire English version, including edits in other sections.':'站点各分区共用一份英文草稿。保存、发布、撤回和放弃更改均作用于整个英文版，包含其他分区的英文修改。'}</p>}
  {error&&<p role="alert">{t(error || '')}</p>}{message&&<p role="status">{t(message || '')}</p>}
  {!row&&error&&<button type="button" className="quiet-button" onClick={()=>setAttempt(value=>value+1)}>{t("m_b8784c8dd5")}</button>}
  {!row&&!error&&<p role="status">{t("m_21bd738e0d")}</p>}
  {row&&<fieldset disabled={busy}>{textFields(visibleGroups?{...row.source,...source}:row.source||source,[],visibleGroups||fields[type]).map((field,index,all)=><Fragment key={field.path.join('.')} >{!taxonomy&&field.path.length>1&&(index===0||field.path[0]!==all[index-1].path[0])&&<h3 className="translation-group-heading">{t(labels[field.path[0]]||field.path[0])}</h3>}<label className="translation-field">
   {taxonomy ? <span>{t('English name')}</span> : <span>{field.path.map(part=>/^\d+$/.test(part)?Number(part)+1:t(labels[part]||part)).join(' / ')}</span>}
   <small lang="zh-CN">{taxonomy ? null : field.value}</small>
   <>{taxonomy||!['content','story','description','summary','bio','intro','subtitle'].includes(field.path.at(-1)!) ? <input lang="en" value={at(draft,field.path)||''} onChange={event=>setDraft(put(draft,field.path,event.target.value))}/> : <textarea lang="en" rows={['content','story','description'].includes(field.path.at(-1)!)?5:2} value={at(draft,field.path)||''} onChange={event=>setDraft(put(draft,field.path,event.target.value))}/>}</>
  </label></Fragment>)}<div className="inline-actions">
   <button type="button" className="quiet-button" disabled={!dirty} onClick={()=>{setDraft(structuredClone(row.draft));setError('');}}>{t("m_ef804eda90")}</button>
   <button type="button" className="quiet-button" disabled={!dirty} onClick={()=>void save('save')}>{t("m_d4a44f9c60")}</button>
   <button type="button" className="quiet-button translation-publish" onClick={()=>void save('publish')}>{t("m_27030c618b")}</button>
   {row.published&&<button type="button" className="quiet-button" onClick={()=>void save('withdraw')}>{t("m_7fb12e9491")}</button>}
  </div></fieldset>}
 </section>;
}
