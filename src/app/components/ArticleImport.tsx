import { notify } from '../lib/feedback';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {CheckCircle2, CircleAlert, ArrowRight} from 'lucide-react';
import {api} from '../lib/api';
import '../../styles/workflow-feedback.css';
export function ArticleImport(){
 const [url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<any>(null);
 async function submit(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');setResult(null);try{setResult(await api('/article-drafts/import',{method:'POST',body:JSON.stringify({url})}));}catch(e:any){setError(e.message||'导入失败，请稍后重试。');notify.error(e.message||'导入失败，请稍后重试。');}finally{setBusy(false);}}
 const warnings=Array.isArray(result?.warnings)?result.warnings:[];
 return <details className="article-import workflow-feedback"><summary>从旧站导入文章</summary><p>粘贴旧站文章链接，正文和图片会导入为草稿，检查后再发布。当前支持 moooncci.cn。</p><form onSubmit={submit}><label htmlFor="article-import-url">旧文章链接</label><div className="article-import-input"><input id="article-import-url" type="url" required value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://moooncci.cn/文章链接/" disabled={busy}/><button className="workflow-button" disabled={busy||!url.trim()}>{busy?'正在导入…':'导入为草稿'}</button></div></form>{busy&&<p role="status">正在下载正文和图片，请稍候。重复导入同一文章不会创建相同草稿。</p>}{error&&<div className="workflow-result" role="alert"><CircleAlert size={20} aria-hidden="true"/><div><h3>导入未完成</h3><p>{error}</p></div></div>}{result&&<section className="workflow-result"><CheckCircle2 size={20} aria-hidden="true"/><div className="workflow-result-body"><div role="status"><h3>{result.replayed?'已找到这篇文章':'已导入为草稿'}</h3><p>{result.replayed?'文章已存在，未重复导入。':`共导入 ${result.image_count||0} 张图片，尚未发布。`}{warnings.length>0&&` 有 ${warnings.length} 项内容需要检查。`}</p></div><Link className="workflow-button workflow-primary" to={result.draft_id?`/admin/write?draft=${result.draft_id}`:`/admin/posts/${result.post_id}/edit`}>{result.draft_id?'打开草稿并检查':'打开文章并检查'}<ArrowRight size={16} aria-hidden="true"/></Link>{warnings.length>0&&<details className="workflow-warning-details"><summary><CircleAlert size={16} aria-hidden="true"/>查看 {warnings.length} 项导入提醒</summary><ul>{warnings.map((w:string,i:number)=><li key={i}>{w}</li>)}</ul></details>}</div></section>}</details>;
}
