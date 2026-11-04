import { useI18n } from '../i18n';
import { useEffect, useState } from 'react';
import { AdminError, AdminLoading } from '../components/admin/AdminState';
import { api } from '../lib/api';
import '../../styles/analytics.css';
type Runtime = { checkedAt:string; api:{startedAt:string;node:string}; worker:{state:string;startedAt:string|null;checkedAt:string|null}; deployment:{revision:string|null;completedAt:string|null;result:string}; migrations:{filename:string;executedAt:string}[]|null; disk:{freeBytes:number;totalBytes:number}|null };

export default function AdminRuntimePage() {
  const { t, formatDate } = useI18n();
  const time=(value:string|null)=>value?formatDate(value,{hour:'2-digit',minute:'2-digit',second:'2-digit'}):t("m_0c3abdcfbf");
 const [data,setData]=useState<Runtime|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;setLoading(true);setError('');api('/admin/runtime').then(value=>{if(active)setData(value);}).catch(e=>{if(active)setError(e.message||t("m_6aa27f14bf"));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[attempt]);
 return <div className="admin-page analytics-page"><header className="analytics-heading"><div><p className="eyebrow">{t("m_0e7e7ca5e5")}</p><h1 className="admin-title">{t("m_0020a68469")}</h1><p className="muted">{t("m_c76735d7b3")}</p></div><div className="analytics-range"><button disabled={loading} onClick={()=>setAttempt(x=>x+1)}>{loading?t("m_86b6d0d630"):t("m_802a407c77")}</button></div></header>
 {loading&&!data&&<AdminLoading label={t("m_58c4f164e1")} />}{error&&<AdminError message={data?t("m_e6e41af9be", {v0: error}):error} onRetry={()=>setAttempt(x=>x+1)} />}{data&&<><p className="muted">{t("m_e6a568c300")} {time(data.checkedAt)}</p><div className="analytics-columns">
 <section className="analytics-section"><h2>API</h2><p>{t("m_be4dc942f5")}{time(data.api.startedAt)}</p><p>Node：{data.api.node}</p></section>
 <section className="analytics-section"><h2>{t("m_6d76b74983")}</h2><p>{data.worker.state==='running'?t("m_3ae4f98fce"):data.worker.state==='stopped'?t("m_f006455e3b"):t("m_5ef203a496")}</p><p>{t("m_b4aa62c175")}{time(data.worker.startedAt)}</p><p>{t("m_68aa217d3d")}{time(data.worker.checkedAt)}</p><p className="muted">{t("m_0c240b7cfc")}</p></section>
 <section className="analytics-section"><h2>{t("m_089ea9f613")}</h2><p style={{overflowWrap:'anywhere'}}>{t("m_9a1ac4d445")}{data.deployment.revision||t("m_a8aa59d54d")}</p><p>{t("m_d104f60044")}{({success:t("m_053461ce86"),failed:t("m_28384d7afd"),'rolled-back':t("m_9d1ac300aa")} as Record<string,string>)[data.deployment.result]||t("m_4d8c1c5b42")}</p><p>{time(data.deployment.completedAt)}</p></section>
 <section className="analytics-section"><h2>{t("m_231d1cdd68")}</h2><p>{data.disk?t("m_26f65967e8", {v0: (data.disk.freeBytes/1073741824).toFixed(1), v1: (data.disk.totalBytes/1073741824).toFixed(1)}):t("m_c270415855")}</p>{data.disk&&data.disk.totalBytes>0&&data.disk.freeBytes/data.disk.totalBytes<0.15&&<p role="alert">{t("m_2ff54f03f9")}</p>}</section></div>
 <section className="analytics-section"><h2>{t("m_4f318ac482")}</h2>{data.migrations===null?<p>{t("m_1d3ed415eb")}</p>:data.migrations.length===0?<p>{t("m_46ca86da52")}</p>:<ul>{data.migrations.map(row=><li key={row.filename} style={{overflowWrap:'anywhere',marginBottom:12}}><code>{row.filename}</code><br/><span className="muted">{time(row.executedAt)}</span></li>)}</ul>}</section></>}
 </div>;
}
