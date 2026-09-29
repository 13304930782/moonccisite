import { notify } from '../lib/feedback';
import {useEffect,useState} from 'react';
import {Monitor,Smartphone,ShieldCheck} from 'lucide-react';
import {api} from '../lib/api';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../components/ui/dialog';
import '../../styles/account-operations.css';
type Session={id:string;browser:string;os:string;first_seen:number;last_seen:number;expires_at:number;current:boolean;legacy:boolean};
const time=(v:number)=>new Date(Number(v)).toLocaleString('zh-CN');
export default function SessionsPage(){
 const [items,setItems]=useState<Session[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[target,setTarget]=useState<Session|'others'|null>(null),[message,setMessage]=useState('');
 const load=async()=>{try{const r=await api('/account/sessions');setItems(r.items);setError('');}catch(e:any){setError(e.message);}};
 useEffect(()=>{void load();},[]);
 const revoke=async()=>{if(!target)return;setBusy(true);setError('');try{const r=await api(target==='others'?'/account/sessions/revoke-others':'/account/sessions/'+target.id,{method:target==='others'?'POST':'DELETE'});if(r.current){window.location.assign('/login');return;}setTarget(null);notify.success(target==='others'?'其他会话已退出，当前浏览器保持登录。':'该会话已退出。');await load();}catch(e:any){setError(e.message); notify.error(e.message);}finally{setBusy(false);}};
 return <section className="sessions-page"><header className="account-page-heading"><div><span className="account-eyebrow">账号安全</span><h1>登录设备</h1><p>查看登录会话，退出不再使用的浏览器。</p></div><button className="engagement-button" disabled={busy||!items} onClick={()=>{setError('');setTarget('others');}}>退出其他会话</button></header>
 {message&&<p className="workspace-alert" role="status">{message}</p>}{error&&!target&&<p role="alert" className="workspace-alert">{error}<button onClick={()=>void load()}>重试</button></p>}
 <div className="session-help"><ShieldCheck size={18}/><p>这里展示浏览器会话，同一设备可能有多条记录。旧登录会在首次使用时登记为历史会话；最近活跃时间最多延迟 5 分钟。</p></div>
 <div className="engagement-panel">{!items?<div className="workspace-empty" role="status">正在加载会话…</div>:!items.length?<div className="workspace-empty"><h2>暂无可显示的会话</h2></div>:items.map(s=><article className="session-row" key={s.id}><span className="session-icon">{/Android|iOS/.test(s.os)?<Smartphone/>:<Monitor/>}</span><div className="session-content"><div className="session-heading"><h2>{s.browser} · {s.os}</h2>{s.current&&<span className="workflow-badge workflow-approved">当前会话</span>}{Boolean(s.legacy)&&<span className="workflow-badge">历史会话</span>}</div><dl><div><dt>首次登录</dt><dd>{time(s.first_seen)}</dd></div><div><dt>最近活跃</dt><dd>{time(s.last_seen)}</dd></div><div><dt>到期时间</dt><dd>{time(s.expires_at)}</dd></div></dl></div><button className="engagement-button" disabled={busy} aria-label={'退出 '+s.browser+' '+s.os+(s.current?' 当前会话':'')} onClick={()=>{setError('');setTarget(s);}}>退出{s.current?'当前会话':''}</button></article>)}</div><p className="operations-note">最多展示最近活跃的 100 个有效会话。退出其他会话也会使尚未登记的旧登录失效。</p>
 <Dialog open={!!target} onOpenChange={open=>{if(!open&&!busy){setTarget(null);setError('');}}}><DialogContent className="workspace-form-dialog"><DialogTitle>{target==='others'?'退出其他会话？':target?.current?'退出当前会话？':'退出这个会话？'}</DialogTitle><DialogDescription>{target==='others'?'其他浏览器将需要重新登录，当前浏览器会保持登录。':target?.current?'确认后会返回登录页面。':'这个浏览器的后续请求将无法通过登录验证，其他会话不受影响。'}</DialogDescription>{error&&<p role="alert">{error}</p>}<button data-dialog-cancel disabled={busy} onClick={()=>setTarget(null)}>取消</button><button className="account-primary-button" disabled={busy} onClick={()=>void revoke()}>{busy?'正在退出…':'确认退出'}</button></DialogContent></Dialog>
 </section>;
}