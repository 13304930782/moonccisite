import {useEffect,useMemo,useState} from 'react';
import {api} from '../lib/api';
import {revisionDiff} from '../lib/revisionDiff';
const labels:Record<string,string>={baseline:'初始基线',auto:'自动保存',manual:'手动保存',publish:'发布版本',restore:'恢复前备份'};
const fields:Record<string,string>={title:'标题',summary:'摘要',category:'分类',tags:'标签',cover_image:'封面',slug:'链接别名',source_url:'导入来源'};
export function ArticleRevisionHistory({draftId,version,current,disabled,onRestore}:{draftId:string;version:number;current:any;disabled:boolean;onRestore:(id:number)=>Promise<boolean>}){
 const [open,setOpen]=useState(false),[page,setPage]=useState(1),[data,setData]=useState<any>(null),[selected,setSelected]=useState<number|null>(null),[detail,setDetail]=useState<any>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{if(!open)return;const controller=new AbortController();setData(null);setError('');api(`/article-drafts/${draftId}/revisions?page=${page}`,{signal:controller.signal}).then(setData).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>controller.abort();},[open,draftId,version,page,attempt]);
 useEffect(()=>{setDetail(null);if(!open||!selected)return;const controller=new AbortController();api(`/article-drafts/${draftId}/revisions/${selected}`,{signal:controller.signal}).then(setDetail).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>controller.abort();},[open,draftId,selected,version,attempt]);
 const chunks=useMemo(()=>{if(!detail)return [];const lines=revisionDiff(detail.payload.content||'',current.content||'');const result=[];for(let i=0;i<lines.length;i+=100)result.push(lines.slice(i,i+100));return result;},[detail,current.content]);
 return <section className="revision-history"><button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>修订历史</button>{open&&<div className="revision-panel">
 <p className="muted">自动历史保留 30 天、最多 200 份；手动保存和发布版本长期保留。恢复不会直接发布。</p>
 {error&&<p role="alert">{error}<button onClick={()=>setAttempt(x=>x+1)}>重试</button></p>}
 {!data&&!error&&<p role="status">正在加载历史…</p>}
 {data&&<><ul className="revision-list">{data.items.map((item:any)=><li key={item.id}><button aria-pressed={selected===item.id} onClick={()=>setSelected(item.id)}>{labels[item.kind]||item.kind} · {new Date(item.updated_at).toLocaleString()} · {item.actor_name||'已注销用户'}</button></li>)}</ul>{!data.items.length&&<p className="muted">暂无历史版本。保存或发布文章后会在这里留下记录。</p>}<div className="inline-actions"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>上一页</button><span>第 {page} 页</span><button disabled={page*20>=data.total} onClick={()=>setPage(p=>p+1)}>下一页</button></div></>}
 {detail&&<div className="revision-compare"><h2>历史版本与当前编辑内容</h2><p>删除标记 − 为历史内容，新增标记 + 为当前内容。</p>
 {Object.entries(fields).map(([key,label])=>{const before=Array.isArray(detail.payload[key])?detail.payload[key].join('、'):detail.payload[key]||'';const after=Array.isArray(current[key])?current[key].join('、'):current[key]||'';return before===after?null:<div className="revision-field" key={key}><strong>{label}</strong><del>{before||'（空）'}</del><ins>{after||'（空）'}</ins></div>})}
 {chunks.map((chunk,i)=><details key={i} open={chunks.length===1}><summary>正文第 {i*100+1}–{i*100+chunk.length} 行 · {chunk.filter(l=>l.kind!=='same').length} 行差异</summary><pre>{chunk.map((line,j)=><span key={j} className={`revision-line revision-${line.kind}`}>{line.kind==='added'?'+ ':line.kind==='removed'?'− ':'  '}{line.text}{'\n'}</span>)}</pre></details>)}
 <button disabled={disabled} onClick={async()=>{if(confirm('将历史内容恢复为草稿？当前内容会先保存并留档，线上文章保持不变。')){if(await onRestore(detail.id)){setSelected(null);setPage(1);}}}}>恢复为草稿</button>
 </div>}
 </div>}</section>;
}
