import { notify } from '../lib/feedback';
import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import {useResource,ResourceState} from '../components/ContentUI';
import {MarkdownContent} from '../components/MarkdownContent';
import '../../styles/blog-foundation.css';
import '../../styles/admin-settings-layout.css';
type Social={name:string;url:string;enabled:boolean};type Friend=Social&{description:string;icon:string};type Form={about:{enabled:boolean;name:string;intro:string;avatar:string;content:string;social:Social[]};links:Friend[]};
export default function AdminBlogPages(){const resource=useResource<Form>('/settings/blog-pages/manage');const [form,setForm]=useState<Form|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');useEffect(()=>{if(resource.data)setForm(resource.data);},[resource.data]);
 function about(key:string,value:unknown){setForm(f=>f?{...f,about:{...f.about,[key]:value}}:f);}
 function change(kind:'links'|'social',index:number,key:string,value:unknown){if(!form)return;const list=kind==='links'?form.links:form.about.social;const next=list.map((x,i)=>i===index?{...x,[key]:value}:x);if(kind==='links')setForm({...form,links:next as Friend[]});else about('social',next);}
 function move(kind:'links'|'social',index:number,delta:number){if(!form)return;const list=[...(kind==='links'?form.links:form.about.social)];if(index+delta<0||index+delta>=list.length)return;[list[index],list[index+delta]]=[list[index+delta],list[index]];if(kind==='links')setForm({...form,links:list as Friend[]});else about('social',list);}
 function remove(kind:'links'|'social',index:number){if(!form)return;if(kind==='links')setForm({...form,links:form.links.filter((_,i)=>i!==index)});else about('social',form.about.social.filter((_,i)=>i!==index));}
 async function save(){if(!form||busy)return;setBusy(true);setMessage('');try{await api('/settings/blog-pages',{method:'PUT',body:JSON.stringify(form)});notify.success('已保存，公开页面已更新。');}catch(e){setMessage((e as Error).message); notify.error((e as Error).message);}finally{setBusy(false);}}
 return <section className="blog-pages-editor settings-workspace">
  <header className="settings-heading"><div><p className="settings-kicker">站点与系统</p><h1>关于与友链</h1><p className="muted">维护公开介绍、社交链接和友情链接。</p></div><button className="settings-save" type="submit" form="blog-pages-form" disabled={!form||busy}>{busy?'正在保存…':'保存设置'}</button></header>
  <ResourceState resource={resource}>{form&&<form id="blog-pages-form" onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy} className="settings-form-body"><legend className="sr-only">公开页面设置</legend>
   <section className="settings-panel" aria-labelledby="about-settings-title"><header className="settings-section-heading"><div><h2 id="about-settings-title">关于我</h2><p>网站的公开介绍。</p></div><label className="settings-toggle"><input type="checkbox" role="switch" checked={form.about.enabled} onChange={e=>about('enabled',e.target.checked)}/><span>公开介绍</span></label></header>
    <div className="settings-fields">{[['name','名称'],['intro','简介'],['avatar','头像地址']].map(([key,label])=><label className={key==='avatar'?'settings-wide':''} key={key}>{label}<input value={String(form.about[key as keyof typeof form.about])} onChange={e=>about(key,e.target.value)}/></label>)}<label className="settings-wide">正文（Markdown）<textarea rows={6} value={form.about.content} onChange={e=>about('content',e.target.value)}/></label></div>
    <details className="settings-preview"><summary>预览介绍正文</summary><MarkdownContent content={form.about.content}/></details>
   </section>
   {(['social','links'] as const).map(kind=>{const list=kind==='social'?form.about.social:form.links;const title=kind==='social'?'社交链接':'友情链接';return <section className="settings-panel" key={kind} aria-labelledby={`${kind}-settings-title`}><header className="settings-section-heading"><div><h2 id={`${kind}-settings-title`}>{title}<span className="settings-count">{list.length}</span></h2><p>{kind==='social'?'展示你的社交账号和联系方式。':'推荐值得访问的网站。'}</p></div><button type="button" className="quiet-button" disabled={list.length>=(kind==='social'?20:100)} onClick={()=>kind==='social'?about('social',[...list,{name:'',url:'',enabled:true}]):setForm({...form,links:[...form.links,{name:'',url:'',description:'',icon:'',enabled:true}]})}>添加{kind==='social'?'社交链接':'友链'}</button></header>
    {!list.length&&<p className="settings-empty">还没有{title}，添加后可在公开页面展示。</p>}
    <div className="settings-link-list">{list.map((row,i)=><fieldset className="settings-link-card" key={i}><legend className="sr-only">{title} {i+1}{row.name?`：${row.name}`:''}</legend><div className="settings-link-heading"><strong><span className="settings-index">{String(i+1).padStart(2,'0')}</span>{row.name||`新${kind==='social'?'社交链接':'友链'}`}</strong><label className="settings-toggle"><input type="checkbox" role="switch" checked={row.enabled} onChange={e=>change(kind,i,'enabled',e.target.checked)}/><span>公开显示</span></label></div>
     <div className="settings-fields">{(kind==='social'?['name','url']:['name','url','description','icon']).map(key=><label key={key}>{({name:'名称',url:'网址',description:'简介',icon:'图标地址'} as Record<string,string>)[key]}<input required={key==='name'||key==='url'} type={key==='url'?'url':'text'} value={String((row as any)[key]||'')} onChange={e=>change(kind,i,key,e.target.value)}/></label>)}</div>
     <div className="settings-link-actions"><div><button type="button" disabled={i===0} aria-label={`上移${title} ${i+1}`} onClick={()=>move(kind,i,-1)}>↑ 上移</button><button type="button" disabled={i===list.length-1} aria-label={`下移${title} ${i+1}`} onClick={()=>move(kind,i,1)}>↓ 下移</button></div><button type="button" aria-label={`移除${title} ${i+1}`} onClick={()=>remove(kind,i)}>移除</button></div>
    </fieldset>)}</div>
   </section>;})}
   <footer className="settings-form-footer"><p>保存后更新公开页面。</p><button className="settings-save" type="submit">{busy?'正在保存…':'保存设置'}</button></footer>
  </fieldset>{message&&<p role="alert">{message}</p>}</form>}</ResourceState>
 </section>;
}
