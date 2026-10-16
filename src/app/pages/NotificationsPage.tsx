import { notify } from '../lib/feedback';
import {ThemeSelect} from '../components/ThemeSelect';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../components/ui/dialog';
import '../../styles/workspace-polish.css';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {Bell,Mail,CheckCheck} from 'lucide-react';
import {api} from '../lib/api';
import {useEngagement} from '../lib/useEngagement';
export default function NotificationsPage(){
 const [params,setParams]=useSearchParams(),kind=params.get('kind')||'',page=/^[1-9]\d*$/.test(params.get('page')||'')?Number(params.get('page')):1;
 const enabled=useEngagement();const [data,setData]=useState<any>(null),[prefs,setPrefs]=useState<any>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[code,setCode]=useState(''),[sent,setSent]=useState(false);
 const [verifyOpen,setVerifyOpen]=useState(false),[verifyError,setVerifyError]=useState(''),[verifyMessage,setVerifyMessage]=useState(''),[resendAt,setResendAt]=useState(0),[now,setNow]=useState(Date.now());
 const request=useRef(0),controller=useRef<AbortController|null>(null),mounted=useRef(true),writeLock=useRef(false),refresh=useRef<()=>Promise<void>>(()=>Promise.resolve());
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current++;controller.current?.abort();};},[]);
 const setKind=(value:string)=>setParams(current=>{const next=new URLSearchParams(current);if(value)next.set('kind',value);else next.delete('kind');next.delete('page');return next;});
 const setPage=(value:number)=>setParams(current=>{const next=new URLSearchParams(current);if(value===1)next.delete('page');else next.set('page',String(value));return next;});
 const load=useCallback(async()=>{
  const id=++request.current,c=new AbortController();controller.current?.abort();controller.current=c;setLoading(true);setError('');
  try{const [n,p]=await Promise.all([api('/engagement/notifications?page='+page+'&kind='+encodeURIComponent(kind),{signal:c.signal,cache:'no-store'}),api('/engagement/preferences',{signal:c.signal,cache:'no-store'})]);if(c.signal.aborted||id!==request.current)return;setData(n);setPrefs(p);}
  catch(e:any){if(!c.signal.aborted&&id===request.current)setError(e.message);}
  finally{if(!c.signal.aborted&&id===request.current)setLoading(false);}
 },[kind,page]);refresh.current=load;
 useEffect(()=>{if(!enabled)return;void load();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!writeLock.current)void load();},60000);return()=>{controller.current?.abort();clearInterval(timer);};},[enabled,load]);
 useEffect(()=>{if(!verifyOpen)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[verifyOpen]);
 const act=async(fn:()=>Promise<any>,text='',apply?:()=>void)=>{
  if(writeLock.current)return;writeLock.current=true;setBusy(true);setError('');setMessage('');
  try{await fn();if(!mounted.current)return;request.current++;controller.current?.abort();apply?.();setMessage(text);await refresh.current();}
  catch(e:any){if(mounted.current){setError(e.message);notify.error(e.message);}}
  finally{writeLock.current=false;if(mounted.current)setBusy(false);}
 };
 const read=(id?:number)=>act(async()=>{const result=await api('/engagement/notifications/read',{method:'PUT',body:JSON.stringify(id===undefined?{}:{id})});window.dispatchEvent(new Event('mooncci:notifications-updated'));return result;},'已标为已读。',()=>{setData((current:any)=>current?{...current,unread:id===undefined?0:Math.max(0,current.unread-(current.items.some((n:any)=>n.id===id&&!n.is_read)?1:0)),items:current.items.map((n:any)=>id===undefined||n.id===id?{...n,is_read:true}:n)}:current);});
 const verify=async(confirm=false)=>{
  if(writeLock.current||(!confirm&&resendAt>Date.now()))return;writeLock.current=true;setBusy(true);setVerifyError('');setVerifyMessage('');
  try{await api(confirm?'/engagement/verify-email/confirm':'/engagement/verify-email',{method:'POST',...(confirm?{body:JSON.stringify({code})}:{})});if(!mounted.current)return;
   if(confirm){setPrefs((current:any)=>({...current,email_verified:true}));setVerifyOpen(false);setCode('');setSent(false);void refresh.current();}
   else{setSent(true);setResendAt(Date.now()+60000);setNow(Date.now());setVerifyMessage('验证码已发送，请查收当前登录邮箱。');}
  }catch(e:any){if(mounted.current){setVerifyError(e.message);if(!confirm&&e.uncertain){setResendAt(Date.now()+60000);setNow(Date.now());}}}
  finally{writeLock.current=false;if(mounted.current)setBusy(false);}
 };
 return <section><header className="account-page-heading"><div><span className="account-eyebrow">消息与提醒</span><h1>通知中心</h1><p>查看互动消息、投稿审核与发布结果。</p></div><button className="engagement-button" disabled={busy||!data?.unread} aria-busy={busy} onClick={()=>void read()}><CheckCheck size={16}/>全部已读</button></header>
 {error&&<p role="alert" className="engagement-alert">{error}<button className="engagement-button" disabled={loading} onClick={()=>void load()}>重新加载通知</button></p>}{message&&<p role="status">{message}</p>}
 {!enabled?<p>通知功能尚未启用。</p>:<>
 <div className="engagement-toolbar"><label>消息分类<ThemeSelect allowEmpty aria-label="消息分类" value={kind} onValueChange={setKind}><option value="">全部通知</option>{Object.entries({comment:'文章评论',reply:'评论回复',approved:'审核通过',rejected:'投稿退回',published:'发布成功',failed:'发布失败'}).map(([v,t])=><option key={v} value={v}>{t}</option>)}</ThemeSelect></label><span>{data?.unread||0} 条未读</span></div>
 <div className="engagement-panel" aria-busy={loading||busy}>{loading&&data&&<p role="status" className="resource-notice">正在更新通知，当前内容仍可查看。</p>}{!data?(error?<p>通知暂时无法加载，请使用上方按钮重试。</p>:<p role="status">正在加载通知…</p>):!data.items.length?<div className="engagement-empty"><Bell size={28}/><h2>{kind ? '没有这类通知' : '暂时没有通知'}</h2><p>{kind ? '可以切换分类，查看其他消息。' : '新的互动和投稿消息会出现在这里。'}</p>{kind && <button className="engagement-button" onClick={()=>setKind('')}>查看全部通知</button>}</div>:data.items.map((n:any)=><article className={'notification-row '+(!n.is_read?'is-unread':'')} key={n.id}><Bell size={18}/><div><h2>{n.title}</h2>{n.message&&<p>{n.message}</p>}<small>{new Date(n.created_at).toLocaleString('zh-CN')}</small><div className="engagement-actions">{n.available&&<Link to={n.url} onClick={()=>{if(!n.is_read)void read(n.id);}}>查看详情 →</Link>}{!n.is_read&&<button className="engagement-button" disabled={busy} aria-busy={busy} onClick={()=>void read(n.id)}>标为已读</button>}</div></div></article>)}</div>
 {(page>1||data?.items.length===20)&&<div className="engagement-pagination"><button disabled={page===1} onClick={()=>setPage(page-1)}>上一页</button><span>第 {page} 页</span><button disabled={!data||data.items.length<20} onClick={()=>setPage(page+1)}>下一页</button></div>}
 {prefs&&<section className="engagement-panel engagement-preferences"><h2><Mail size={18}/>邮件通知</h2><p>按需开启，不影响安全邮件和周刊订阅。</p>{!prefs.email_verified?<div className="notification-verification"><div><strong>验证通知邮箱</strong><p>验证当前登录邮箱后，即可开启邮件提醒。</p></div><button className="engagement-button" disabled={busy} onClick={()=>{setVerifyError('');setVerifyMessage('');setVerifyOpen(true);}}>验证邮箱</button></div>:<p className="notification-verified">邮箱已验证，可以选择需要的邮件提醒。</p>}

 {[['comment_email','新评论邮件','有人评论你的文章时通知你。'],['reply_email','回复邮件','有人回复你的评论时通知你。']].map(([key,title,description])=><label className="engagement-toggle" key={key}><div><strong>{title}</strong><small>{description}</small></div><input type="checkbox" checked={prefs[key]} disabled={busy||!prefs.email_verified} aria-busy={busy} onChange={e=>{const checked=e.target.checked;void act(()=>api('/engagement/preferences',{method:'PUT',body:JSON.stringify({[key]:checked})}),'通知设置已保存。',()=>setPrefs((current:any)=>({...current,[key]:checked})));}}/></label>)}
 </section>}</>}
 <Dialog open={verifyOpen} onOpenChange={open=>{if(!writeLock.current)setVerifyOpen(open);}}><DialogContent className="notification-verify-dialog"><DialogTitle>验证通知邮箱</DialogTitle><DialogDescription>验证码将发送至当前登录邮箱，验证后可开启评论与回复邮件。</DialogDescription>{verifyMessage&&<p role="status" className="verification-status">{verifyMessage}</p>}{verifyError&&<p role="alert" className="verification-error">{verifyError}</p>}{sent&&<label className="verification-code">邮箱验证码<input autoFocus disabled={busy} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="输入 6 位验证码"/></label>}<div className="verification-actions">{sent&&<button className="account-primary-button" disabled={busy||code.length!==6} onClick={()=>void verify(true)}>{busy?'正在验证…':'确认验证'}</button>}<button className={sent?'engagement-button':'account-primary-button'} disabled={busy||resendAt>now} onClick={()=>void verify()}>{resendAt>now?Math.ceil((resendAt-now)/1000)+' 秒后可重发':sent?'重新发送验证码':'发送邮箱验证码'}</button></div></DialogContent></Dialog>
 </section>;
}
