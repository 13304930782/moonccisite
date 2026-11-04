import { useI18n } from '../i18n';
import {useCallback,useEffect,useRef,useState} from 'react';

import {Link} from '../components/LocaleLink';
import {SiteBack} from '../components/SiteBack';
import {RefreshCw,Settings,Server} from 'lucide-react';
import {api,ApiError} from '../lib/api';
import {useAuth} from '../context/AuthContext';
import '../../styles/node-monitor.css';
import '../../styles/workspace-polish.css';
type Node={id:string;name:string;region:string;group:string;state:'online'|'offline'|'unknown';updatedAt:string|null;cpu:number|null;ram:number|null;ramTotal:number|null;disk:number|null;diskTotal:number|null;netIn:number|null;netOut:number|null};
type Snapshot={checkedAt:string;nodes:Node[]};
const bytes=(n:number|null)=>{if(n===null)return '—';const units=['B','KiB','MiB','GiB','TiB'];let i=0;while(n>=1024&&i<4){n/=1024;i++;}return `${n.toFixed(i?1:0)} ${units[i]}`;};
function Metric({name,value,detail,percent}:{name:string;value:string;detail?:string;percent:number|null}){return <div className="node-metric"><div><span>{name}</span><strong>{value}</strong></div><div className="node-meter" aria-hidden="true"><span style={{width:`${percent===null?0:Math.min(100,Math.max(0,percent))}%`}}/></div>{detail&&<small>{detail}</small>}</div>;}
export default function NodeMonitorPage(){
  const { locale,  t } = useI18n();
 const {user}=useAuth(),[data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[paused,setPaused]=useState(false),[denied,setDenied]=useState(false),flight=useRef(false),mounted=useRef(true);
 const refresh=useCallback(async()=>{if(flight.current)return;flight.current=true;setBusy(true);try{const value=await api('/node-monitor/snapshot');if(mounted.current){setData(value);setError('');setDenied(false);}}catch(e){if(mounted.current){setError(e instanceof Error?e.message:t("m_3b984d1e82"));if(e instanceof ApiError&&[401,403].includes(e.status)){setData(null);setDenied(true);}}}finally{flight.current=false;if(mounted.current)setBusy(false);}},[]);
 useEffect(()=>{mounted.current=true;void refresh();return()=>{mounted.current=false;};},[refresh]);
 useEffect(()=>{if(paused||denied)return;const poll=()=>{if(document.visibilityState==='visible')void refresh();};const timer=setInterval(poll,15000);document.addEventListener('visibilitychange',poll);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',poll);};},[paused,denied,refresh]);
 const nodes=data?.nodes||[],online=nodes.filter(n=>n.state==='online').length;
 return <div className="node-page"><SiteBack/><header className="workspace-heading"><div><span className="workspace-eyebrow">MOONCCI / MONITOR</span><h1>{t("m_07e96c1e12")}</h1><p>{t("m_fd0a0586bb")}</p></div>{user?.role==='owner'&&<Link className="node-button" to="/admin/node-monitor"><Settings size={16} aria-hidden="true"/>{t("m_3ebce80bab")}</Link>}</header>
 <div className="node-toolbar"><p>{data?<>{t("m_7153f0918a")} <time dateTime={data.checkedAt}>{new Date(data.checkedAt).toLocaleTimeString(locale,{timeZone:'Asia/Shanghai'})}</time></>:busy?t("m_f5ea865ba6"):t("m_238e073244")}</p><div><button className="node-button" aria-pressed={paused} onClick={()=>setPaused(v=>!v)}>{paused?t("m_cc68cc58f0"):t("m_0dc83c30ce")}</button><button className="node-button" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16} aria-hidden="true"/>{busy?t("m_30fa385526"):t("m_aee8874341")}</button></div></div>
 {error&&<p className="node-notice" role="alert">{t(error || '')}{data&&t("m_e89c5acf80")}</p>}
 {data&&<><dl className="node-summary"><div><dt>{t("m_e8f9f94b38")}</dt><dd>{nodes.length}</dd></div><div><dt>{t("m_b9086662b1")}</dt><dd>{online}</dd></div><div><dt>{t("m_be1b4f3c6c")}</dt><dd>{nodes.filter(n=>n.state==='offline').length}</dd></div><div><dt>{t("m_93e474c68e")}</dt><dd>{nodes.filter(n=>n.state==='unknown').length}</dd></div></dl><div className="node-grid">{nodes.map(n=><article className="node-card" key={n.id}><header><div><h2><Server size={18} aria-hidden="true"/>{n.name||t("m_1de4a3ee0d")}</h2><p>{[n.region,n.group].filter(Boolean).join(' · ')||t("m_ca810b2b92")}</p></div><span className={`node-state node-state-${n.state}`}>{n.state==='online'?t("m_b9086662b1"):n.state==='offline'?t("m_be1b4f3c6c"):t("m_93e474c68e")}</span></header><Metric name="CPU" value={n.cpu===null?'—':`${n.cpu.toFixed(1)}%`} percent={n.cpu}/><Metric name={t("m_7d8f8c37ec")} value={n.ram!==null&&n.ramTotal?`${(n.ram/n.ramTotal*100).toFixed(1)}%`:'—'} detail={`${bytes(n.ram)} / ${bytes(n.ramTotal)}`} percent={n.ram!==null&&n.ramTotal?n.ram/n.ramTotal*100:null}/><Metric name={t("m_de7b72a3f8")} value={n.disk!==null&&n.diskTotal?`${(n.disk/n.diskTotal*100).toFixed(1)}%`:'—'} detail={`${bytes(n.disk)} / ${bytes(n.diskTotal)}`} percent={n.disk!==null&&n.diskTotal?n.disk/n.diskTotal*100:null}/><dl className="node-network"><div><dt>{t("m_6e68458688")}</dt><dd>{bytes(n.netIn)}{n.netIn!==null&&'/s'}</dd></div><div><dt>{t("m_edecf0ae6e")}</dt><dd>{bytes(n.netOut)}{n.netOut!==null&&'/s'}</dd></div></dl><footer>{n.updatedAt?<>{t("m_dc7334ceb0")}<time dateTime={n.updatedAt}>{new Date(n.updatedAt).toLocaleString(locale,{timeZone:'Asia/Shanghai'})}</time></>:t("m_15b76d726f")}</footer></article>)}</div>{!nodes.length&&<div className="node-panel"><h2>{t("m_281309d31d")}</h2><p>{t("m_81ceaf77c9")}</p></div>}</>}
 </div>;
}
