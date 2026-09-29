import { notify } from '../lib/feedback';
import { confirmAction } from '../lib/confirmAction';
import {useEffect,useState} from 'react';
import {ArticleMediaPicker} from '../components/ArticleMediaPicker';
import {safeImageSrc} from '../lib/safeUrl';
import '../../styles/article-workspace.css';
import {Library} from 'lucide-react';
import {Link} from 'react-router-dom';
import {api} from '../lib/api';
import '../../styles/publishing.css';
const blank={title:'',slug:'',description:'',cover_image:''};
export default function AdminSeriesPage(){
 const [items,setItems]=useState<any[]>([]),[form,setForm]=useState<any>(null),[posts,setPosts]=useState<any[]>([]),[postId,setPostId]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[matches,setMatches]=useState<any[]>([]),[searching,setSearching]=useState(false),[searched,setSearched]=useState(false),[mediaOpen,setMediaOpen]=useState(false),[saved,setSaved]=useState<{slug:string;visible:boolean}|null>(null);
 async function load(){try{setItems((await api('/series?manage=true')).items);setError('');}catch(e:any){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 async function edit(item:any){setBusy(true);setError('');try{const r=await api('/series/manage/'+item.id+'/articles');setForm({...item});setPosts(r.items);setMatches([]);setSearched(false);setPostId('');}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 async function save(){setBusy(true);setError('');try{const r=await api('/series'+(form.id?'/'+form.id:''),{method:form.id?'PUT':'POST',body:JSON.stringify(form)});const id=form.id||r.id;setForm({...form,id,slug:r.slug||form.slug});await api('/series/'+id+'/articles',{method:'PUT',body:JSON.stringify({post_ids:posts.map(p=>p.id)})});setSaved({slug:r.slug||form.slug,visible:posts.some(p=>p.status==='published')});setForm(null);await load();}catch(e:any){setError(e.message); notify.error(e.message);}finally{setBusy(false);}}
 async function search(){setSearching(true);setError('');try{const r=await api('/posts?search='+encodeURIComponent(postId.trim())+'&pageSize=20');setMatches(r.items||[]);setSearched(true);}catch(e:any){setError(e.message);}finally{setSearching(false);}}
 function add(post:any){setPosts(current=>current.some(p=>p.id===post.id)?current:[...current,post]);}

 function move(index:number,offset:number){setPosts(current=>{const result=[...current];[result[index],result[index+offset]]=[result[index+offset],result[index]];return result;});}
 return <section className="admin-page publishing-page series-admin-page"><header className="workspace-heading"><div><span className="workspace-eyebrow">内容发布</span><h1>专栏管理</h1><p>把相关的文章整理成系列，安排读者的阅读顺序。</p></div><Link to="/series" className="series-public-link">查看公开专栏 →</Link></header>
 {saved&&!form&&<p className="workspace-alert" role="status">专栏已保存。{saved.visible?<Link to={'/series/'+saved.slug}>查看公开专栏 →</Link>:'添加已发布文章后，读者就能看到这个专栏。'}</p>}
 {error&&<p role="alert">{error}<button onClick={()=>void load()}>重新加载列表</button></p>}
 {loading?<p role="status">正在加载…</p>:!form&&<><div className="series-list-toolbar"><h2>全部专栏 <small>{items.length}</small></h2><button disabled={busy} onClick={()=>{setForm({...blank});setPosts([]);setMatches([]);setSearched(false);setPostId('');}}>新建专栏</button></div>{!items.length&&<div className="queue-panel workspace-empty"><span className="workspace-empty-icon"><Library size={26}/></span><h2>还没有专栏</h2><p>新建一个专栏，把同一主题的文章放在一起。</p></div>}<div className="publishing-list">{items.map(item=><article className="publishing-card" key={item.id}><h2>{item.title}</h2><p>{item.article_count} 篇公开文章</p><div className="publishing-actions"><button disabled={busy} onClick={()=>void edit(item)}>编辑与排序</button><button disabled={busy} onClick={async()=>{if(!(await confirmAction('删除专栏？文章仍然保留。')))return;setBusy(true);try{await api('/series/'+item.id,{method:'DELETE'});await load();}catch(e:any){setError(e.message); notify.error(e.message);}finally{setBusy(false);}}}>删除专栏</button></div></article>)}</div></>}
 {form&&<form className="publishing-card" onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy}>
 <label>名称<input required maxLength={255} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
 <details><summary>自定义专栏链接（可选）</summary><p>留空时自动生成可用链接，日后修改会改变专栏地址。</p><label>链接别名<input pattern="[a-z0-9][a-z0-9-]*" maxLength={191} value={form.slug} onChange={e=>setForm({...form,slug:e.target.value})}/></label></details>
 <label>简介<textarea maxLength={10000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
 <div><h2>专栏封面</h2>{safeImageSrc(form.cover_image)&&<img src={safeImageSrc(form.cover_image)} alt="专栏封面预览" style={{width:'100%',maxHeight:180,objectFit:'cover',borderRadius:12}}/>}<button type="button" onClick={()=>setMediaOpen(true)}>{form.cover_image?'更换封面':'从媒体库选择封面'}</button>{form.cover_image&&<button type="button" onClick={()=>setForm({...form,cover_image:''})}>移除封面</button>}</div>
 <h2 className="series-order-heading">文章顺序</h2><p>搜索已发布文章，点击添加后可调整顺序；保存专栏后生效。</p>
 <label>查找文章<input type="search" placeholder="输入标题或关键词" value={postId} onChange={e=>{setPostId(e.target.value);setSearched(false);setMatches([]);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void search();}}}/></label><button type="button" disabled={searching} onClick={()=>void search()}>{searching?'正在查找…':'查找文章'}</button>
 {searched&&<div className="series-search-results" role="region" aria-label="文章搜索结果">{!matches.length?<p>没有找到文章，换一个关键词试试。</p>:<><p>最多显示 20 篇，输入更具体的关键词可缩小范围。</p>{matches.map(post=><div className="series-search-row" key={post.id}><span>{post.title}</span><button type="button" disabled={posts.some(p=>p.id===post.id)} onClick={()=>add(post)}>{posts.some(p=>p.id===post.id)?'已添加':'添加到专栏'}</button></div>)}</>}</div>}
 <ol>{posts.map((post,index)=><li key={post.id}>{post.title}（{post.status==='published'?'已发布':'未公开'}）<button type="button" aria-label={'上移 '+post.title} disabled={index===0} onClick={()=>move(index,-1)}>上移</button><button type="button" aria-label={'下移 '+post.title} disabled={index===posts.length-1} onClick={()=>move(index,1)}>下移</button><button type="button" onClick={()=>setPosts(p=>p.filter(x=>x.id!==post.id))}>移出</button></li>)}</ol>
 <div className="publishing-actions"><button type="submit">保存专栏</button><button type="button" onClick={()=>setForm(null)}>取消编辑</button></div></fieldset></form>}{mediaOpen&&<ArticleMediaPicker onClose={()=>setMediaOpen(false)} onSelect={url=>setForm((current:any)=>current?{...current,cover_image:url}:current)}/>}</section>;
}
