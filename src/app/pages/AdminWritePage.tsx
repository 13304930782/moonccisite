import { SecondaryActions } from '../components/SecondaryActions';
import { confirmAction } from '../lib/confirmAction';
import { notify } from '../lib/feedback';
import { api } from '../lib/api';
import {usePublishing} from '../lib/usePublishing';
import {ArticleRevisionHistory} from '../components/ArticleRevisionHistory';
import {ArticleConflict} from '../components/ArticleConflict';
import {ArticleReview} from '../components/ArticleReview';
import {MarkdownContent} from '../components/MarkdownContent';
import {safeImageSrc} from '../lib/safeUrl';
import {ArticleMediaPicker} from '../components/ArticleMediaPicker';
import {useState,useRef,useEffect} from 'react';
import {ArrowLeft, CheckCircle2, FileText} from 'lucide-react';
import {Link,useParams} from 'react-router-dom';
import {useAuth} from '../context/AuthContext';
import {ArticleEditor} from '../components/ArticleEditor';
import {useArticleDraft} from '../lib/useArticleDraft';
import {ThemeSelect} from '../components/ThemeSelect';
import '../../styles/article-workspace.css';
export default function AdminWritePage(){const {id}=useParams();const {user}=useAuth();return user?<Workspace key={`${user.id}:${id||'new'}`} userId={user.id} postId={id}/>:null;}
function Workspace({userId,postId}:{userId:number;postId?:string}){
 const {user}=useAuth();const publishing=usePublishing();const contributor=publishing&&!['owner','admin'].includes(user?.role||'');
 const [published,setPublished]=useState(false);
 const [conflictMode,setConflictMode]=useState<'compare'|'review'|'edit'>('compare');
 const completion=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{if(published)completion.current?.focus();},[published]);
 const [preview,setPreview]=useState(false),[picker,setPicker]=useState<'cover'|'body'|null>(null); const insert=useRef<(url:string,alt:string)=>void>(()=>{});
 const d=useArticleDraft(userId,postId);const [uploadCount,setUploads]=useState(0),[editorPending,setEditorPending]=useState(false),[uploadError,setUploadError]=useState(''),[quality,setQuality]=useState('medium');const uploads=uploadCount+(editorPending?1:0);
 const locked=publishing&&['submitted','approved','scheduled'].includes(d.draft?.workflow?.state);
 const submissionPanel=useRef<HTMLDivElement>(null);
 useEffect(()=>{const shortcut=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==='s'){event.preventDefault();if(!event.repeat&&d.ready&&!locked&&!d.busy&&!d.blocked&&!d.isRestoring)void d.save('manual');}};window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut);},[d.save,d.ready,d.busy,d.blocked,d.isRestoring,locked]);
 const fixField=(field:string)=>{setPreview(false);requestAnimationFrame(()=>{const target=document.getElementById('article-'+field)||document.querySelector<HTMLElement>('[aria-label="Markdown 正文"], .article-editor [contenteditable="true"], .article-editor button');const details=target?.closest('details');if(details)details.open=true;target?.focus();});};
 const reviewState=d.draft?.workflow?.state;
 const submit=async()=>{if(await d.action('submit')){setPreview(false);notify.success('稿件已提交审核');}};
 const publish=async()=>{if(await (conflictMode==='review'&&d.serverCopy?d.resolveConflict('publish-current'):d.action('publish'))){setPreview(false);setConflictMode('edit');setPublished(true);}};
 const lockedTitle=reviewState==='scheduled'?'已安排定时发布':reviewState==='approved'?'审核已通过，等待发布':'待管理员审核';
 const backTo=location.pathname.startsWith('/account')?'/account/submissions':'/admin/posts';
 const change=(key:string,value:any)=>d.update((previous:any)=>({...previous,[key]:value}));
 const showComparison=!!d.serverCopy&&conflictMode==='compare';
 const inspect=async()=>{setConflictMode('compare');await d.inspect();};
 const resolveConflict=async(choice:'publish-current'|'keep-current'|'adopt-post'|'adopt-draft')=>{if(await d.resolveConflict(choice)){setPreview(false);setConflictMode('edit');}};
 const upload=async(file:File)=>{setUploads(n=>n+1);setUploadError('');try{const body=new FormData();body.append('image',file);body.append('quality',quality);const r=await api('/upload/image',{method:'POST',body});return r.url as string;}finally{setUploads(n=>Math.max(0,n-1));}};
 if(published)return <div className="admin-page article-workspace"><Link className="article-back-link" to={backTo}><ArrowLeft size={16} aria-hidden="true"/>返回稿件列表</Link><section className="article-published"><CheckCircle2 size={32} aria-hidden="true"/><p className="article-workspace-eyebrow">发布完成</p><h1 ref={completion} tabIndex={-1}>文章已发布</h1><p className="article-published-title">{d.form.title}</p><p className="article-workspace-caption">读者现在可以查看这篇文章。后续修改需再次发布才会更新到网站。</p><div className="article-completion-actions">{d.draft?.post_id&&<Link className="article-button article-button-primary" to={`/article/${d.draft.post_id}`}>查看文章 ↗</Link>}<button className="article-button" onClick={()=>setPublished(false)}>继续编辑</button><Link className="article-back-link" to={backTo}>返回稿件列表 →</Link></div></section></div>;
 return <div className="admin-page article-workspace">
 {locked?<div className="article-submission-bar" ref={submissionPanel} tabIndex={-1}><Link to={backTo}>← 返回稿件列表</Link><p role="status">{lockedTitle}</p><small>审核结果和后续操作可在稿件列表查看。</small>{reviewState==='scheduled'&&<small>北京时间 {new Date(Number(d.draft.workflow.scheduled_at)).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</small>}</div>:<header className="article-workspace-header"><Link className="article-back-link" to={backTo}><ArrowLeft size={16} aria-hidden="true"/>返回稿件列表</Link><div className="article-workspace-heading"><div><p className="article-workspace-eyebrow">{preview?'预览与发布':'内容编辑'}</p><h1 className="admin-title">{showComparison?'处理版本冲突':preview?'发布前检查':postId||d.draft?.post_id?'编辑文章':'写文章'}</h1></div><p className="article-save-status" role="status">{!d.busy&&!d.dirty&&!d.error?<CheckCircle2 size={16} aria-hidden="true"/>:<FileText size={16} aria-hidden="true"/>}{d.status}</p></div>{preview&&<p className="article-workspace-caption">{d.form.title||'未命名文章'}</p>}</header>}
 {d.ready&&!locked&&!preview&&!showComparison&&<ArticleRevisionHistory draftId={d.draft.id} version={d.draft.version} current={d.form} disabled={locked||d.busy||d.blocked||d.isRestoring||uploads>0} onRestore={d.restore}/>}{!locked&&!d.localAvailable&&<p role="alert">本地恢复副本不可用，请确认服务器保存成功后再离开。</p>}
 {!locked&&d.error&&!showComparison&&!(conflictMode==='review'&&d.serverCopy)&&<div className="article-workspace-notice" role="alert"><h2>{d.errorStatus===409?'版本冲突，尚未发布':'操作尚未完成'}</h2><p>{d.error}</p><div className="inline-actions">{d.errorStatus===409?<button className="article-button article-button-primary" disabled={d.busy} onClick={()=>void inspect()}>对比并选择版本</button>:<>{d.errorStatus===401&&<a className="article-button" href="/login" target="_blank" rel="noopener noreferrer">重新登录（新窗口）</a>}<button disabled={d.busy||d.blocked} onClick={()=>void d.save('manual')}>重试保存</button></>}<button onClick={()=>void navigator.clipboard.writeText(d.form.content).then(()=>notify.success('正文已复制')).catch(()=>setUploadError('无法访问剪贴板，请在 Markdown 源码中手动复制。'))}>复制当前正文</button></div></div>}
 {showComparison&&!locked&&<ArticleConflict comparison={d.serverCopy} current={d.form} busy={d.busy} onResolve={resolveConflict} onRefresh={()=>void inspect()} onPublish={()=>{setConflictMode('review');setPreview(true);}} onContinue={()=>{setConflictMode('edit');setPreview(false);}}/>}
 {conflictMode==='review'&&d.serverCopy&&<div className="article-workspace-notice"><h2>将使用当前内容覆盖发布</h2><p>已选择的网站版本会保存到修订历史。请检查下方内容，再确认覆盖。</p><button className="article-button" disabled={d.busy} onClick={()=>setConflictMode('compare')}>返回版本对比</button>{d.errorStatus!==409&&d.error&&<p role="alert">{d.error}</p>}</div>}
 {!locked&&d.recovery&&<div className="article-workspace-notice" role="alert">发现未同步的本地内容。<button onClick={()=>d.resolve(true)}>恢复本地内容</button><button onClick={()=>d.resolve(false)}>使用服务器内容</button></div>}
 {picker&&<ArticleMediaPicker uploadImage={upload} restoreFocus={picker!=='body'} onClose={()=>setPicker(null)} onSelect={(url,alt)=>{if(picker==='cover')change('cover_image',url);else insert.current(url,alt);}}/>}
 {preview&&!locked&&!showComparison&&<section className="article-full-preview"><button className="article-button article-return-edit" disabled={d.busy} onClick={()=>setPreview(false)}><ArrowLeft size={16} aria-hidden="true"/>返回编辑</button><ArticleReview onFix={fixField} post={{...d.form,author_name:'当前作者'}} busy={d.busy||d.isRestoring||uploads>0} disabled={d.blocked&&!(conflictMode==='review'&&d.serverCopy)} publishLabel={conflictMode==='review'?'确认覆盖发布':contributor?'确认提交审核':d.draft?.post_status==='published'?'确认更新':'确认发布'} onPublish={()=>void (contributor?submit():publish())}/></section>}
 {locked&&<article className="submission-document"><header><span className="account-eyebrow">稿件详情</span><h1>{d.form.title||'未命名稿件'}</h1><p className="submission-document-meta">提交的审核版本 · 仅作者与审核人员可见</p></header><div className="submission-document-body">{safeImageSrc(d.form.cover_image)&&<img className="content-image" src={safeImageSrc(d.form.cover_image)} alt=""/>}<MarkdownContent content={d.form.content||''} headingPrefix="submission-heading"/></div></article>}
 <fieldset hidden={preview||locked||showComparison} disabled={!d.ready||locked||!!d.recovery||d.isRestoring} className="article-writing-fields"><label>标题<input id="article-title" value={d.form.title} maxLength={255} onChange={e=>change('title',e.target.value)} placeholder="未命名草稿"/></label>
 <button type="button" onClick={()=>setPicker('body')}>从媒体库插入正文图片</button>
 {d.ready&&<ArticleEditor registerImageInsert={fn=>{insert.current=fn;}} value={d.form.content} onChange={value=>change('content',value)} existing={!!postId||!!d.draft?.payload?.content} uploadImage={upload} onError={setUploadError} onBusy={setEditorPending}/>}
 <details className="article-settings"><summary>文章设置</summary>
 <div className="article-settings-body">
  <section className="article-settings-section"><h2>摘要</h2><label>文章简介<textarea id="article-summary" rows={4} value={d.form.summary} onChange={e=>change('summary',e.target.value)} placeholder="简要介绍文章内容"/></label></section>
  <section className="article-settings-section"><h2>封面</h2><div className="article-settings-grid">
   <label className="article-field-wide">封面地址<input value={d.form.cover_image} onChange={e=>change('cover_image',e.target.value)} placeholder="输入图片地址，或从媒体库选择"/></label>
   <div className="inline-actions article-field-wide"><button type="button" onClick={()=>setPicker('cover')}>从媒体库选择封面</button><button type="button" disabled={!d.form.cover_image} onClick={()=>change('cover_image','')}>移除封面</button></div>
   <label>上传封面<input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f).then(url=>change('cover_image',url)).catch(e=>setUploadError(e.message));e.target.value='';}}/></label>
   <label>图片质量<ThemeSelect aria-label="图片质量" value={quality} onValueChange={setQuality}><option value="low">较小</option><option value="medium">标准</option><option value="high">高清</option></ThemeSelect></label>
  </div></section>
  {d.form.source_url&&<section className="article-settings-section"><h2>旧站来源</h2><p>{d.form.source_url}</p><p>原发布时间：{d.form.published_at}（首次发布时保留）</p></section>}
  <section className="article-settings-section"><h2>分类与链接</h2><div className="article-settings-grid">
   <label>分类<input id="article-category" value={d.form.category} onChange={e=>change('category',e.target.value)}/></label>
   <label>标签（逗号分隔）<input value={d.form.tags.join(', ')} onChange={e=>change('tags',e.target.value.split(',').map(x=>x.trim()))}/></label>
   <label className="article-field-wide">链接别名<input value={d.form.slug} onChange={e=>change('slug',e.target.value)} placeholder="留空时自动生成"/></label>
  </div></section>
 </div></details></fieldset>
 {uploadError&&<p role="alert">{uploadError}</p>}{uploads>0&&<p role="status">正在上传图片…</p>}
 {!locked&&!preview&&!showComparison&&<div className="article-save-bar"><div className="article-save-bar-inner">
 <button disabled={locked||!d.ready||d.busy||d.blocked||d.isRestoring} onClick={()=>void d.save('manual')}>{d.busy?'保存中…':'保存草稿'}</button>
 <button className="article-action-publish" disabled={!d.ready||locked||d.busy||d.isRestoring||d.blocked||uploads>0} onClick={()=>setPreview(true)}>{contributor?'预览并提交审核':d.draft?.post_status==='published'?'预览并更新':'预览并发布'}</button>
 <SecondaryActions>
 {publishing&&!contributor&&<button disabled={!d.ready||locked||d.busy||d.blocked||uploads>0} onClick={()=>void submit()}>提交到审核 / 发布计划</button>}
 {!contributor&&d.draft?.post_status==='published'&&<button disabled={locked||d.busy||d.isRestoring||d.blocked} onClick={async ()=>{if(await confirmAction('撤回后读者将无法访问这篇文章，确定撤回？'))void d.action('withdraw');}}>撤回为草稿</button>}
 {d.draft?.post_status==='published'&&<Link to={`/article/${d.draft.post_id}`}>查看文章</Link>}
 {d.draft&&<button disabled={locked||d.busy||d.isRestoring||uploads>0} onClick={async ()=>{if(await confirmAction(d.draft.post_id?'放弃这份修订稿和当前未保存内容？公开文章和历史保持不变。':'永久删除这份未发布草稿及其全部历史？'))void d.discard();}}>{d.draft.post_id?'放弃未发布修改':'删除草稿及历史'}</button>}
 </SecondaryActions></div></div>}
 </div>;
}
