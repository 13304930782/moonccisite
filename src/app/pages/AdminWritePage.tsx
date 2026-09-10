import {ArticlePresentation} from '../components/ArticlePresentation';
import {ArticleMediaPicker} from '../components/ArticleMediaPicker';
import {useState,useRef} from 'react';
import {Link,useParams} from 'react-router-dom';
import {useAuth} from '../context/AuthContext';
import {ArticleEditor} from '../components/ArticleEditor';
import {useArticleDraft} from '../lib/useArticleDraft';
import {ThemeSelect} from '../components/ThemeSelect';
import '../../styles/article-workspace.css';
export default function AdminWritePage(){const {id}=useParams();const {user}=useAuth();return user?<Workspace key={`${user.id}:${id||'new'}`} userId={user.id} postId={id}/>:null;}
function Workspace({userId,postId}:{userId:number;postId?:string}){
 const [preview,setPreview]=useState(false),[previewWidth,setPreviewWidth]=useState('desktop'),[picker,setPicker]=useState<'cover'|'body'|null>(null); const insert=useRef<(url:string,alt:string)=>void>(()=>{});
 const d=useArticleDraft(userId,postId);const [uploads,setUploads]=useState(0),[uploadError,setUploadError]=useState(''),[quality,setQuality]=useState('medium');
 const change=(key:string,value:any)=>d.update((previous:any)=>({...previous,[key]:value}));
 const upload=async(file:File)=>{setUploads(n=>n+1);setUploadError('');try{const body=new FormData();body.append('image',file);body.append('quality',quality);const res=await fetch('/api/upload/image',{method:'POST',credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest'},body});const r=await res.json();if(!res.ok)throw new Error(r.message||'上传失败');return r.url as string;}finally{setUploads(n=>Math.max(0,n-1));}};
 return <div className="admin-page article-workspace"><Link to="/admin/posts">返回文章管理</Link><h1 className="admin-title">{postId?'编辑文章':'写文章'}</h1>
 <p role="status">{d.status}</p>{!d.localAvailable&&<p role="alert">本地恢复副本不可用，请确认服务器保存成功后再离开。</p>}
 {d.error&&<div role="alert">{d.error}<div className="inline-actions"><a href="/login" target="_blank" rel="noopener noreferrer">重新登录（新窗口）</a><button onClick={()=>void d.save()}>重试保存</button><button onClick={()=>void d.inspect()}>查看服务器版本</button><button onClick={()=>void navigator.clipboard.writeText(JSON.stringify(d.form,null,2)).catch(()=>setUploadError('无法访问剪贴板，请在 Markdown 源码中手动复制。'))}>复制当前内容</button><button onClick={()=>{if(confirm('请先复制需要保留的内容，重新加载服务器版本？'))location.reload();}}>重新加载</button></div></div>}
 {d.serverCopy&&<section><h2>服务器版本</h2><pre className="article-conflict-copy">{JSON.stringify(d.serverCopy.payload,null,2)}</pre><button onClick={()=>{if(confirm('使用服务器版本替换当前编辑内容？请先复制需要保留的内容。'))d.adopt();}}>使用此版本</button></section>}
 {d.recovery&&<div role="alert">发现未同步的本地内容。<button onClick={()=>d.resolve(true)}>恢复本地内容</button><button onClick={()=>d.resolve(false)}>使用服务器内容</button></div>}
 {picker&&<ArticleMediaPicker onClose={()=>setPicker(null)} onSelect={(url,alt)=>{if(picker==='cover')change('cover_image',url);else insert.current(url,alt);}}/>}
 {preview&&<section className="article-full-preview"><div className="inline-actions"><button onClick={()=>setPreview(false)}>返回编辑</button><ThemeSelect aria-label="预览宽度" value={previewWidth} onValueChange={setPreviewWidth}><option value="desktop">桌面</option><option value="mobile">手机</option></ThemeSelect></div><div className={previewWidth==='mobile'?'article-preview-mobile':''}><ArticlePresentation preview post={{...d.form,author_name:'当前作者'}}/></div></section>}
 <fieldset hidden={preview} disabled={!d.ready||!!d.recovery} className="article-writing-fields"><label>标题<input value={d.form.title} maxLength={255} onChange={e=>change('title',e.target.value)} placeholder="未命名草稿"/></label>
 <button type="button" onClick={()=>setPicker('body')}>从媒体库插入正文图片</button>
 {d.ready&&<ArticleEditor registerImageInsert={fn=>{insert.current=fn;}} value={d.form.content} onChange={value=>change('content',value)} existing={!!postId||!!d.draft?.payload?.content} uploadImage={upload} onError={setUploadError} onBusy={()=>{}}/>}
 <details className="article-settings"><summary>文章设置</summary><label>摘要<textarea value={d.form.summary} onChange={e=>change('summary',e.target.value)}/></label><label>封面地址<input value={d.form.cover_image} onChange={e=>change('cover_image',e.target.value)}/></label>
 <div className="inline-actions"><button onClick={()=>setPicker('cover')}>从媒体库选择封面</button><button disabled={!d.form.cover_image} onClick={()=>change('cover_image','')}>移除封面</button></div>
 <label>上传封面<input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f).then(url=>change('cover_image',url)).catch(e=>setUploadError(e.message));e.target.value='';}}/></label>
 <label>图片质量<ThemeSelect value={quality} onValueChange={setQuality}><option value="low">较小</option><option value="medium">标准</option><option value="high">高清</option></ThemeSelect></label>
 <label>分类<input value={d.form.category} onChange={e=>change('category',e.target.value)}/></label><label>标签（逗号分隔）<input value={d.form.tags.join(', ')} onChange={e=>change('tags',e.target.value.split(',').map(x=>x.trim()))}/></label><label>链接别名<input value={d.form.slug} onChange={e=>change('slug',e.target.value)}/></label></details></fieldset>
 {uploadError&&<p role="alert">{uploadError}</p>}{uploads>0&&<p role="status">正在上传图片…</p>}
 <div className="article-save-bar">{d.draft?.post_id&&<button disabled={d.busy||uploads>0} onClick={()=>{if(confirm('放弃这份修订稿和当前未保存内容？公开文章保持不变。需要保留的内容请先复制。'))void d.discard();}}>放弃未发布修改</button>}<button className="article-action-preview" disabled={!d.ready} onClick={()=>setPreview(!preview)}>{preview?'返回编辑':'预览'}</button><button disabled={!d.ready||d.busy||d.blocked} onClick={()=>void d.save()}>保存草稿</button><button className="article-action-publish" disabled={!d.ready||d.busy||d.blocked||uploads>0} onClick={()=>void d.action('publish')}>{d.draft?.post_status==='published'?'更新发布':'发布文章'}</button>{d.draft?.post_status==='published'&&<button disabled={d.busy||d.blocked} onClick={()=>{if(confirm('撤回后读者将无法访问这篇文章，确定撤回？'))void d.action('withdraw');}}>撤回为草稿</button>}{d.draft?.post_status==='published'&&<Link to={`/article/${d.draft.post_id}`}>查看文章</Link>}</div>
 </div>;
}
