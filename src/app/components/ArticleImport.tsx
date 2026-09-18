import {useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../lib/api';
export function ArticleImport(){
 const [url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<any>(null);
 async function submit(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');setResult(null);try{setResult(await api('/article-drafts/import',{method:'POST',body:JSON.stringify({url})}));}catch(e:any){setError(e.message||'导入失败，请稍后重试。');}finally{setBusy(false);}}
 return <details className="article-import"><summary>从旧站导入文章</summary><p>粘贴旧站文章链接，正文和图片会导入为草稿，预览确认后再发布。当前支持 moooncci.cn。</p><form onSubmit={submit}><label htmlFor="article-import-url">旧文章链接</label><div className="article-import-input"><input id="article-import-url" type="url" required value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://moooncci.cn/develop/文章别名/" disabled={busy}/><button disabled={busy||!url.trim()}>{busy?'正在导入正文和图片…':'导入为草稿'}</button></div></form>{busy&&<p role="status">正在下载图片，请稍候。重复提交不会创建相同文章。</p>}{error&&<p role="alert">{error}</p>}{result&&<div role="status"><p>{result.replayed?'这篇文章已经存在，未重复导入。':`已导入草稿，共 ${result.image_count} 张图片。`}</p>{result.warnings?.map((w:string,i:number)=><p key={i}>{w}</p>)}<Link to={result.draft_id?`/admin/write?draft=${result.draft_id}`:`/admin/posts/${result.post_id}/edit`}>打开文章 / 检查预览 →</Link></div>}</details>;
}
