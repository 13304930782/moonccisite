import { useI18n } from '../i18n';
import '../../styles/workflow-feedback.css';
import { confirmAction } from '../lib/confirmAction';
import {useEffect,useMemo,useState} from 'react';
import {api} from '../lib/api';
import {revisionDiff} from '../lib/revisionDiff';
import {describeCoverCrop} from '../lib/coverCrop';
const labels:Record<string,string>={baseline:'初始基线',auto:'自动保存',manual:'手动保存',publish:'发布版本',restore:'恢复前备份'};
const fields:Record<string,string>={title:'标题',summary:'摘要',category:'分类',tags:'标签',cover_image:'封面',cover_crop:'封面显示范围',slug:'链接别名',source_url:'导入来源'};
export function ArticleRevisionHistory({draftId,version,current,disabled,onRestore}:{draftId:string;version:number;current:any;disabled:boolean;onRestore:(id:number)=>Promise<boolean>}){
  const { locale,  t } = useI18n();
 const [open,setOpen]=useState(false),[page,setPage]=useState(1),[data,setData]=useState<any>(null),[selected,setSelected]=useState<number|null>(null),[detail,setDetail]=useState<any>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{if(!open)return;const controller=new AbortController();setData(null);setError('');api(`/article-drafts/${draftId}/revisions?page=${page}`,{signal:controller.signal}).then(setData).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>controller.abort();},[open,draftId,version,page,attempt]);
 useEffect(()=>{setDetail(null);if(!open||!selected)return;const controller=new AbortController();api(`/article-drafts/${draftId}/revisions/${selected}`,{signal:controller.signal}).then(setDetail).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>controller.abort();},[open,draftId,selected,version,attempt]);
 const chunks=useMemo(()=>{if(!detail)return [];const lines=revisionDiff(detail.payload.content||'',current.content||'');const result=[];for(let i=0;i<lines.length;i+=100)result.push(lines.slice(i,i+100));return result;},[detail,current.content]);
 return <section className="revision-history"><button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>{t("m_b11590c91f")}</button>{open&&<div className="revision-panel">
 <p className="muted">{t("m_dd778e3e01")}</p>
 {error&&<p role="alert">{t(error || '')}<button onClick={()=>setAttempt(x=>x+1)}>{t("m_b8784c8dd5")}</button></p>}
 {!data&&!error&&<p role="status">{t("m_7b78a6e7b2")}</p>}
 {data&&<><ul className="revision-list">{data.items.map((item:any)=><li key={item.id}><button aria-pressed={selected===item.id} onClick={()=>setSelected(item.id)}>{t(labels[item.kind]||item.kind)} · {new Date(item.updated_at).toLocaleString(locale,{timeZone:'Asia/Shanghai'})} · {item.actor_name||t("m_ceef0f6d8c")}</button></li>)}</ul>{!data.items.length&&<p className="muted">{t("m_f287629123")}</p>}{data.total>20&&<div className="inline-actions"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>{t("m_c9b9ae7a61")}</button><span>{t("m_af50a0fe2a")} {page}  {t("m_d24d3c9946")}</span><button disabled={page*20>=data.total} onClick={()=>setPage(p=>p+1)}>{t("m_8a8542f696")}</button></div>}</>}
 {detail&&<div className="revision-compare"><header className="revision-selection-header"><div><h2>{t("m_6ef4cca60a")}</h2><p>{t(labels[detail.kind]||t("m_6fd29579ab"))} · {new Date(detail.updated_at).toLocaleString(locale,{timeZone:'Asia/Shanghai'})}</p><p>{t("m_8adf8b3f55")}</p></div> <button className="workflow-button workflow-primary" disabled={disabled} onClick={async()=>{if((await confirmAction(t("m_0624fb4a70")))){if(await onRestore(detail.id)){setSelected(null);setPage(1);}}}}>{t("m_42f3afc667")}</button></header><p>{t("m_59cf93db79")}</p>
 {Object.entries(fields).map(([key,label])=>{const before=key==='cover_crop'?describeCoverCrop(detail.payload[key]):Array.isArray(detail.payload[key])?detail.payload[key].join('、'):detail.payload[key]||'';const after=key==='cover_crop'?describeCoverCrop(current[key]):Array.isArray(current[key])?current[key].join('、'):current[key]||'';return before===after?null:<div className="revision-field" key={key}><strong>{t(label)}</strong><del>{before||t("m_fa8bc5e925")}</del><ins>{after||t("m_fa8bc5e925")}</ins></div>})}
 {chunks.map((chunk,i)=><details key={i} open={chunks.length===1}><summary>{t("m_3e87e99175")} {i*100+1}–{i*100+chunk.length}  {t("m_7049a63d1e")} {chunk.filter(l=>l.kind!=='same').length}  {t("m_67b9c10465")}</summary><pre>{chunk.map((line,j)=><span key={j} className={`revision-line revision-${line.kind}`}>{line.kind==='added'?'+ ':line.kind==='removed'?'− ':'  '}{line.text}{'\n'}</span>)}</pre></details>)}

 </div>}
 </div>}</section>;
}
