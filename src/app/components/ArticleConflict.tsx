import { useI18n } from '../i18n';
import {useMemo,useState} from 'react';
import {ArrowLeftRight, ChevronDown} from 'lucide-react';
import {MarkdownContent} from './MarkdownContent';
import {revisionDiff} from '../lib/revisionDiff';
import {confirmAction} from '../lib/confirmAction';
import {describeCoverCrop} from '../lib/coverCrop';

type Choice='publish-current'|'keep-current'|'adopt-post'|'adopt-draft';
const labels:Record<string,string>={title:'标题',summary:'摘要',category:'分类',tags:'标签',slug:'文章链接',cover_image:'封面',cover_crop:'封面显示范围'};
const display=(value:any)=>Array.isArray(value)?value.join('、'):String(value||'（未填写）');
const fieldDisplay=(key:string,value:any)=>key==='cover_crop'?describeCoverCrop(value):display(value);
export function ArticleConflict({comparison,current,busy,onResolve,onPublish,onRefresh,onContinue}:{comparison:any;current:any;busy:boolean;onResolve:(choice:Choice)=>Promise<void>;onPublish:()=>void;onRefresh:()=>void;onContinue:()=>void}){
  const { locale,  t } = useI18n();
 const [target,setTarget]=useState<'post'|'draft'>(comparison.post?'post':'draft');
 const selected=target==='post'?comparison.post:comparison.draft;
 const other=selected.payload;
 const diff=useMemo(()=>revisionDiff(other.content||'',current.content||''),[other.content,current.content]);
 const changes=diff.filter(x=>x.kind!=='same');
 const adopt=async()=>{if(await confirmAction(t("m_00109da838"),t("m_43aeb8d6c3")))await onResolve(target==='post'?'adopt-post':'adopt-draft');};
 return <section className="article-conflict" aria-labelledby="conflict-title">
  <header><ArrowLeftRight size={24} aria-hidden="true"/><div><h2 id="conflict-title">{t("m_39d395dcfe")}</h2><p>{t("m_36487ae4e2")}</p></div></header>
  <div className="article-conflict-actions"><button className="article-button article-button-primary" disabled={busy} onClick={comparison.can_publish?onPublish:()=>void onResolve('keep-current')}>{comparison.can_publish?t("m_5aaf53091a"):t("m_5408c29c1a")}</button><button className="article-button" disabled={busy} onClick={()=>void adopt()}>{t("m_6f6004072a")}{target==='post'?t("m_fb8d739d08"):t("m_19e66dc7db")}{t("m_5f76b2bf82")}</button><button className="article-button" disabled={busy} onClick={onRefresh}>{t("m_2370ca0328")}</button><button className="article-back-link" disabled={busy} onClick={onContinue}>{t("m_5f3db4c597")}</button></div>
  <p className="article-workspace-caption">{comparison.can_publish?t("m_711a9b3e48"):t("m_06a0bf3e01")}</p>
  {comparison.post&&<div className="article-conflict-tabs" role="group" aria-label={t("m_1578e50546")}><button className="article-button" aria-pressed={target==='post'} disabled={busy} onClick={()=>setTarget('post')}>{t("m_ad3fa8f409")}</button><button className="article-button" aria-pressed={target==='draft'} disabled={busy} onClick={()=>setTarget('draft')}>{t("m_19e66dc7db")}</button></div>}
  <div className="article-conflict-columns">
   <section><h3>{t("m_2b4ceb842f")}</h3><p className="article-conflict-meta">{t("m_26b7577b2d")}</p><h4>{current.title||t("m_8feae66b88")}</h4><div className="article-conflict-reading"><MarkdownContent content={current.content||t("m_715c749ae4")} headingPrefix="conflict-local"/></div></section>
   <section><h3>{target==='post'?t("m_5a0192e344"):t("m_19e66dc7db")}</h3><p className="article-conflict-meta">{t("m_5f76b2bf82")} {selected.version} · {selected.updated_at?new Date(selected.updated_at).toLocaleString(locale,{timeZone:'Asia/Shanghai'}):t("m_925ecf6e20")}{target==='draft'&&comparison.last_recorded_by?t("m_5a2b3d5326", {v0: comparison.last_recorded_by}):''}</p><h4>{other.title||t("m_8feae66b88")}</h4><div className="article-conflict-reading"><MarkdownContent content={other.content||t("m_715c749ae4")} headingPrefix="conflict-remote"/></div></section>
  </div>
  <details className="article-conflict-diff"><summary><ChevronDown size={16} aria-hidden="true"/>{t("m_a8ff9dd6a3")} {changes.length}  {t("m_375523c32d")}</summary><p>{t("m_8f1d62daa2")}</p>{Object.entries(labels).filter(([key])=>fieldDisplay(key,current[key])!==fieldDisplay(key,other[key])).map(([key,label])=><div className="revision-field" key={key}><strong>{t(label)}</strong><del>{fieldDisplay(key,other[key])}</del><ins>{fieldDisplay(key,current[key])}</ins></div>)}<pre>{changes.length?changes.map((line,i)=><span key={i} className={`revision-line revision-${line.kind}`}>{line.kind==='added'?'+ ':'− '}{line.text}{'\n'}</span>):t("m_33bfbaaeaa")}</pre></details>
 </section>;
}
