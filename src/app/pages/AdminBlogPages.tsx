import {useEffect,useRef,useState} from 'react';
import {notify} from '../lib/feedback';
import {api} from '../lib/api';
import {useResource,ResourceState} from '../components/ContentUI';
import type {AboutData} from '../components/AboutContent';
import {ArticleMediaPicker} from '../components/ArticleMediaPicker';
import {TagInput} from '../components/TagInput';
import {AboutPreview} from '../components/blog-pages/AboutPreview';
import {ModuleRow,moduleKeys,type ModuleKey,moduleLabels} from '../components/blog-pages/ModuleRow';
import {LinkCard,type SocialLink,type FriendLink} from '../components/blog-pages/LinkCard';
import {SaveBar} from '../components/blog-pages/SaveBar';
import {Switch} from '../components/blog-pages/Switch';
import {SortableList} from '../components/blog-pages/SortableList';
import {safeImageSrc} from '../lib/safeUrl';
import {useUnsavedLeave} from '../lib/useUnsavedLeave';
import '../../styles/article-workspace.css';
import '../../styles/admin-blog-pages.css';
type Form={about:Omit<AboutData,'social'>&{social:SocialLink[]};links:FriendLink[]};
type Tab='about'|'social'|'links';
const emptyDraft={badges:'',technologies:''};
function addTags(tags:string[],draft:string,limit:number){return [...new Set([...tags,...draft.split(/[,，]/).map(x=>x.trim()).filter(Boolean)])].slice(0,limit);}
export default function AdminBlogPages(){
 const resource=useResource<Form>('/settings/blog-pages/manage');
 const [form,setForm]=useState<Form|null>(null),[saved,setSaved]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [tab,setTab]=useState<Tab>('about'),[draft,setDraft]=useState(emptyDraft),[picker,setPicker]=useState<'avatar'|'story'|null>(null),[failedAvatar,setFailedAvatar]=useState('');
 const story=useRef<HTMLTextAreaElement>(null),formElement=useRef<HTMLFormElement>(null),selection=useRef({content:'',start:0,end:0});
 const rowKeys=useRef(new WeakMap<object,string>()),nextKey=useRef(0);
 const rowKey=(row:object)=>{let key=rowKeys.current.get(row);if(!key){key=`link-${++nextKey.current}`;rowKeys.current.set(row,key);}return key;};
 useEffect(()=>{if(resource.data){setForm(resource.data);setSaved(JSON.stringify(resource.data));setDraft(emptyDraft);}},[resource.data]);
 const dirty=!!form&&(JSON.stringify(form)!==saved||!!draft.badges.trim()||!!draft.technologies.trim());useUnsavedLeave(dirty);
 function about(key:string,value:unknown){setForm(current=>current?{...current,about:{...current.about,[key]:value}}:current);}
 function commitTags(key:'badges'|'technologies',value:string){setForm(current=>current?{...current,about:{...current.about,[key]:addTags(current.about[key]||[],value,key==='badges'?8:30)}}:current);setDraft(previous=>({...previous,[key]:''}));}
 function insertStoryImage(url:string,alt:string){
  const safe=safeImageSrc(url);if(!safe){setMessage('图片地址无效');return;}
  const escaped=alt.replace(/\\/g,'\\\\').replace(/\[/g,'\\[').replace(/\]/g,'\\]').replace(/[\r\n]/g,' ');
  const markdown=`![${escaped}](<${safe.replace(/>/g,'%3E').replace(/</g,'%3C').replace(/\s/g,'%20')}>)`;
  setForm(current=>{if(!current)return current;const text=current.about.content,previous=selection.current;
   const start=text===previous.content?previous.start:text.length,end=text===previous.content?previous.end:text.length;
   requestAnimationFrame(()=>{story.current?.focus({preventScroll:true});story.current?.setSelectionRange(start+markdown.length,start+markdown.length);});
   return {...current,about:{...current.about,content:text.slice(0,start)+markdown+text.slice(end)}};
  });
 }
 function changeLink(kind:'links'|'social',index:number,key:string,value:unknown){setForm(current=>{if(!current)return current;const list=kind==='links'?current.links:current.about.social;const next=list.map((item,i)=>{if(i!==index)return item;const updated={...item,[key]:value};rowKeys.current.set(updated,rowKey(item));return updated;});return kind==='links'?{...current,links:next as FriendLink[]}:{...current,about:{...current.about,social:next}};});}
 function discard(){if(!saved)return;setForm(JSON.parse(saved));setDraft(emptyDraft);setMessage('');}
 async function save(){
  if(!form||busy)return;
  const pending={...form,about:{...form.about,badges:addTags(form.about.badges||[],draft.badges,8),technologies:addTags(form.about.technologies||[],draft.technologies,30)}};
  setForm(pending);setDraft(emptyDraft);setBusy(true);setMessage('');
  try{const {message:_message,...value}=await api('/settings/blog-pages',{method:'PUT',body:JSON.stringify(pending)});setForm(value as Form);setSaved(JSON.stringify(value));notify.success('已保存，公开页面已更新。');}
  catch(error){setMessage((error as Error).message);notify.error((error as Error).message);}finally{setBusy(false);}
 }
 return <section className="bp-editor">
  <div className="bp-top"><SaveBar dirty={dirty} saving={busy} onDiscard={discard} onSave={()=>formElement.current?.requestSubmit()}/><div className="bp-tabs" role="tablist" aria-label="关于与友链设置">{(['about','social','links'] as const).map(kind=><button key={kind} id={`bp-tab-${kind}`} type="button" role="tab" aria-selected={tab===kind} aria-controls={`bp-panel-${kind}`} tabIndex={tab===kind?0:-1} onClick={()=>setTab(kind)} onKeyDown={event=>{const order:Tab[]=['about','social','links'];let next:Tab|undefined;if(event.key==='ArrowRight')next=order[(order.indexOf(kind)+1)%3];if(event.key==='ArrowLeft')next=order[(order.indexOf(kind)+2)%3];if(event.key==='Home')next='about';if(event.key==='End')next='links';if(next){event.preventDefault();setTab(next);document.getElementById(`bp-tab-${next}`)?.focus();}}}>{kind==='about'?'关于我':kind==='social'?'社交链接':'友情链接'}{kind!=='about'&&<span className="bp-count">{kind==='social'?form?.about.social.length||0:form?.links.length||0}</span>}</button>)}</div></div>
  <ResourceState resource={resource}>{form&&<form ref={formElement} className="bp-form" onSubmit={event=>{event.preventDefault();void save();}} onInvalid={event=>{const panel=(event.target as HTMLElement).closest('[role="tabpanel"]');if(panel){setTab(panel.id.replace('bp-panel-','') as Tab);requestAnimationFrame(()=>(event.target as HTMLInputElement).focus());}}}>
   {message&&<p className="bp-error" role="alert">{message}</p>}<fieldset className="bp-form-body" disabled={busy}><legend className="sr-only">公开页面设置</legend>
   <div className="bp-panel" id="bp-panel-about" role="tabpanel" aria-labelledby="bp-tab-about" hidden={tab!=='about'}><div className="bp-about-grid"><div className="bp-stack">
    <section className="bp-card"><header className="bp-card-heading"><div><h2>基本信息</h2><p>显示在页面顶部的身份卡片</p></div><span className="bp-public-switch">公开介绍<Switch label="公开介绍" checked={form.about.enabled} onChange={value=>about('enabled',value)}/></span></header>
     <div className="bp-identity-row"><div className="bp-avatar" aria-hidden="true">{safeImageSrc(form.about.avatar)&&failedAvatar!==form.about.avatar?<img src={safeImageSrc(form.about.avatar)} alt="" onError={()=>setFailedAvatar(form.about.avatar)}/>:Array.from(form.about.name.trim()||'?')[0]}</div><div className="bp-identity-fields"><div className="bp-fields"><label className="bp-field">名称<input maxLength={100} value={form.about.name} onChange={e=>about('name',e.target.value)}/></label><label className="bp-field">简介<input maxLength={500} value={form.about.intro} onChange={e=>about('intro',e.target.value)}/></label></div><label className="bp-field" htmlFor="about-avatar">头像地址</label><div className="bp-inline"><input id="about-avatar" maxLength={2048} value={form.about.avatar} onChange={e=>about('avatar',e.target.value)}/><button type="button" onClick={()=>setPicker('avatar')}>媒体库</button></div></div></div>
    </section>
    <section className="bp-card"><header className="bp-card-heading"><div><h2>正文</h2><p>支持 Markdown，显示在「关于这个博客」模块</p></div></header><label className="sr-only" htmlFor="about-story">正文（Markdown）</label><textarea id="about-story" ref={story} rows={7} maxLength={50000} value={form.about.content} onChange={e=>about('content',e.target.value)}/><div className="bp-media-actions"><button type="button" onClick={()=>{selection.current={content:form.about.content,start:story.current?.selectionStart??form.about.content.length,end:story.current?.selectionEnd??form.about.content.length};setPicker('story');}}>插入图片</button></div></section>
    <section className="bp-card"><header className="bp-card-heading"><div><h2>标签</h2><p>回车或逗号添加</p></div></header><div className="bp-tag-fields">{(['badges','technologies'] as const).map(key=><div key={key}><label className="bp-field" htmlFor={`about-${key}`}>{key==='badges'?'个人标签':'常用技术'}</label><TagInput id={`about-${key}`} tags={form.about[key]||[]} value={draft[key]} maxTags={key==='badges'?8:30} emptyBackspace onInput={value=>setDraft(previous=>({...previous,[key]:value}))} onCommit={value=>commitTags(key,value)} onRemove={index=>about(key,(form.about[key]||[]).filter((_,i)=>i!==index))}/></div>)}</div></section>
    <section className="bp-card"><header className="bp-card-heading"><div><h2>页面模块</h2><p>按住 ⠿ 上下拖动调整顺序，开关控制是否显示，内容为空的模块自动隐藏</p></div></header><SortableList items={(form.about.moduleOrder||moduleKeys) as ModuleKey[]} getKey={key=>key} getLabel={key=>moduleLabels[key]} onReorder={order=>about('moduleOrder',order)} disabled={busy} className="bp-module-list">{(module,_index,handle)=><ModuleRow module={module} about={form.about} handle={handle} onChange={about}/>}</SortableList></section>
   </div><AboutPreview about={form.about}/></div></div>
   {(['social','links'] as const).map(kind=>{const list=kind==='social'?form.about.social:form.links,title=kind==='social'?'社交链接':'友情链接';return <div className="bp-panel" id={`bp-panel-${kind}`} role="tabpanel" aria-labelledby={`bp-tab-${kind}`} hidden={tab!==kind} key={kind}><header className="bp-list-heading"><h2>{title}</h2><button type="button" disabled={list.length>=(kind==='social'?20:100)} onClick={()=>kind==='social'?about('social',[...form.about.social,{name:'',url:'',enabled:true}]):setForm({...form,links:[...form.links,{name:'',url:'',description:'',icon:'',enabled:true}]})}>＋ 添加{kind==='social'?'社交链接':'友链'}</button></header>{!list.length&&<p className="bp-empty">还没有{title}，添加后可在公开页面展示。</p>}<SortableList<SocialLink|FriendLink> items={list} getKey={rowKey} getLabel={row=>row.name||`新${title}`} disabled={busy} className="bp-link-list" onReorder={next=>kind==='social'?about('social',next):setForm({...form,links:next as FriendLink[]})}>{(row,index,handle)=><LinkCard row={row} index={index} kind={kind} handle={handle} onChange={(key,value)=>changeLink(kind,index,key,value)} onRemove={()=>kind==='social'?about('social',form.about.social.filter((_,i)=>i!==index)):setForm({...form,links:form.links.filter((_,i)=>i!==index)})}/>}</SortableList></div>;})}
   </fieldset></form>}</ResourceState>
  {picker&&<ArticleMediaPicker restoreFocus={picker!=='story'} onClose={()=>setPicker(null)} onSelect={(url,alt)=>picker==='avatar'?about('avatar',url):insertStoryImage(url,alt)}/>}
 </section>;
}
