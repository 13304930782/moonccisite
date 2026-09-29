import {useMemo,useState} from 'react';
import {ArrowLeftRight, ChevronDown} from 'lucide-react';
import {MarkdownContent} from './MarkdownContent';
import {revisionDiff} from '../lib/revisionDiff';
import {confirmAction} from '../lib/confirmAction';

type Choice='publish-current'|'keep-current'|'adopt-post'|'adopt-draft';
const labels:Record<string,string>={title:'标题',summary:'摘要',category:'分类',tags:'标签',slug:'文章链接',cover_image:'封面'};
const display=(value:any)=>Array.isArray(value)?value.join('、'):String(value||'（未填写）');
export function ArticleConflict({comparison,current,busy,onResolve,onPublish,onRefresh,onContinue}:{comparison:any;current:any;busy:boolean;onResolve:(choice:Choice)=>Promise<void>;onPublish:()=>void;onRefresh:()=>void;onContinue:()=>void}){
 const [target,setTarget]=useState<'post'|'draft'>(comparison.post?'post':'draft');
 const selected=target==='post'?comparison.post:comparison.draft;
 const other=selected.payload;
 const diff=useMemo(()=>revisionDiff(other.content||'',current.content||''),[other.content,current.content]);
 const changes=diff.filter(x=>x.kind!=='same');
 const adopt=async()=>{if(await confirmAction('采用所选版本前，会将当前编辑内容和服务器草稿保存到修订历史。采用后不会直接发布。','备份并采用'))await onResolve(target==='post'?'adopt-post':'adopt-draft');};
 return <section className="article-conflict" aria-labelledby="conflict-title">
  <header><ArrowLeftRight size={24} aria-hidden="true"/><div><h2 id="conflict-title">对比并选择版本</h2><p>当前内容仍在这里。选择前请核对差异，被替换的内容会保留在修订历史。</p></div></header>
  <div className="article-conflict-actions"><button className="article-button article-button-primary" disabled={busy} onClick={comparison.can_publish?onPublish:()=>void onResolve('keep-current')}>{comparison.can_publish?'检查并覆盖发布当前内容':'保留当前草稿'}</button><button className="article-button" disabled={busy} onClick={()=>void adopt()}>采用{target==='post'?'网站':'服务器草稿'}版本</button><button className="article-button" disabled={busy} onClick={onRefresh}>重新获取版本</button><button className="article-back-link" disabled={busy} onClick={onContinue}>继续编辑当前内容 →</button></div>
  <p className="article-workspace-caption">{comparison.can_publish?'覆盖发布前仍需检查；若期间版本再次变化，会请你重新对比。':'保留草稿后，可继续编辑并按原流程提交审核。'}</p>
  {comparison.post&&<div className="article-conflict-tabs" role="group" aria-label="对比对象"><button className="article-button" aria-pressed={target==='post'} disabled={busy} onClick={()=>setTarget('post')}>网站文章</button><button className="article-button" aria-pressed={target==='draft'} disabled={busy} onClick={()=>setTarget('draft')}>服务器草稿</button></div>}
  <div className="article-conflict-columns">
   <section><h3>当前编辑内容</h3><p className="article-conflict-meta">包含本页尚未保存的修改</p><h4>{current.title||'未命名文章'}</h4><div className="article-conflict-reading"><MarkdownContent content={current.content||'（正文为空）'} headingPrefix="conflict-local"/></div></section>
   <section><h3>{target==='post'?'网站当前版本':'服务器草稿'}</h3><p className="article-conflict-meta">版本 {selected.version} · {selected.updated_at?new Date(selected.updated_at).toLocaleString():'更新时间未记录'}{target==='draft'&&comparison.last_recorded_by?` · 最近历史记录：${comparison.last_recorded_by}`:''}</p><h4>{other.title||'未命名文章'}</h4><div className="article-conflict-reading"><MarkdownContent content={other.content||'（正文为空）'} headingPrefix="conflict-remote"/></div></section>
  </div>
  <details className="article-conflict-diff"><summary><ChevronDown size={16} aria-hidden="true"/>查看具体差异 · {changes.length} 行正文变化</summary><p>− 为所选版本内容，+ 为当前编辑内容。可复制需要保留的部分，返回编辑后合并。</p>{Object.entries(labels).filter(([key])=>display(current[key])!==display(other[key])).map(([key,label])=><div className="revision-field" key={key}><strong>{label}</strong><del>{display(other[key])}</del><ins>{display(current[key])}</ins></div>)}<pre>{changes.length?changes.map((line,i)=><span key={i} className={`revision-line revision-${line.kind}`}>{line.kind==='added'?'+ ':'− '}{line.text}{'\n'}</span>):'正文内容相同。'}</pre></details>
 </section>;
}
