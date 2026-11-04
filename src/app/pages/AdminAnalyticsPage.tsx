import { useI18n } from '../i18n';
import '../../styles/analytics.css';
import '../../styles/analytics.css';
import {useEffect,useState} from 'react';
import {api} from '../lib/api';
const number=(x:any)=>Number(x||0).toLocaleString('zh-CN');
const labels:Record<string,string>={mobile:'手机',tablet:'平板',desktop:'电脑',direct:'直接访问 / 未提供来源',owner:'站长',admin:'管理员',editor:'编辑',teacher:'教师',user:'普通用户',github:'GitHub',google:'Google',gitee:'Gitee',microsoft:'Microsoft',qq:'QQ',wechat:'微信'};
function Ranking({title,rows,value='views'}:{title:string;rows:any[];value?:string}){
  const { locale,  t } = useI18n();return <section className="analytics-section"><h2>{title}</h2>{rows.length?<ol className="analytics-ranking">{rows.map((row,i)=><li key={`${row.label||row.path}-${i}`}><span>{labels[row.label]?t(labels[row.label]):row.label||row.path}</span><strong>{number(row[value])}</strong></li>)}</ol>:<p className="muted">{t("m_497c85690c")}</p>}</section>;}
export default function AdminAnalyticsPage(){
  const { locale,  t } = useI18n();
 const [days,setDays]=useState(30),[data,setData]=useState<any>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setData(null);setError('');api(`/admin/analytics?days=${days}`).then(x=>{if(active)setData(x);}).catch(e=>{if(active)setError(e.message||t("m_d1d044826a"));});return()=>{active=false;};},[days,attempt]);
 const trend=data?.trend||[],max=Math.max(1,...trend.map((x:any)=>x.views));
 return <div className="admin-page analytics-page"><header className="analytics-heading"><div><p className="eyebrow">{t("m_0e7e7ca5e5")}</p><h1 className="admin-title">{t("m_3943942fd1")}</h1><p className="muted">{t("m_7fa246bd07")}</p></div><div className="analytics-range" aria-label={t("m_80ee5ade81")}>{[7,30,90].map(n=><button key={n} aria-pressed={days===n} onClick={()=>setDays(n)}>{t("m_03aeb7c768")} {n}  {t("m_49da61ceee")}</button>)}</div></header>
 {error?<div role="alert">{t(error || '')} <button className="text-link" onClick={()=>setAttempt(x=>x+1)}>{t("m_7bdd5ce1e2")}</button></div>:!data?<p role="status">{t("m_76d0853695")}</p>:<>
 <div className="analytics-metrics">{[[t("m_76f24e7f7c"),data.summary.views],[t("m_e7609409d3"),data.summary.visitors],[t("m_d4e280e036"),trend.reduce((sum:number,x:any)=>sum+x.registrations,0)],[t("m_e4aec3c852"),data.summary.totalViews]].map(([label,value])=><div key={label}><span className="muted">{label}</span><strong>{number(value)}</strong></div>)}</div>
 <section className="analytics-section"><div className="analytics-section-title"><h2>{t("m_4e64c7a559")}</h2><span className="muted">{data.start} — {data.end} · UTC</span></div><div className="analytics-chart" role="img" aria-label={t("m_db20074964", {v0: days})}>
 {trend.map((x:any)=><div className="analytics-bar-track" key={x.day} title={t("m_fe1b2ba595", {v0: x.day, v1: x.views, v2: x.visitors})}><span style={{height:`${x.views/max*100}%`}}/></div>)}
 </div><div className="analytics-axis"><span>{data.start}</span><span>{data.end}</span></div>
 <details className="analytics-daily"><summary>{t("m_c3e146894c")}</summary><div className="analytics-table"><div className="analytics-table-row muted"><span>{t("m_70d0c1b336")}</span><span>{t("m_a8c81f93f2")}</span><span>{t("m_8b358d0f97")}</span><span>{t("m_c4fb62202b")}</span></div>{trend.map((x:any)=><div className="analytics-table-row" key={x.day}><span>{x.day}</span><span>{number(x.views)}</span><span>{number(x.visitors)}</span><span>{number(x.registrations)}</span></div>)}</div></details></section>
 <div className="analytics-columns"><Ranking title={t("m_89d9db257f")} rows={data.popular}/><Ranking title={t("m_c8f6058871")} rows={data.sources}/><Ranking title={t("m_2f1b7e332a")} rows={data.devices}/><section className="analytics-section"><h2>{t("m_e1e76ccf87")}</h2><dl className="analytics-ranking">{[[t("m_c33596b752"),data.users.active],[t("m_1b99cd4e18"),data.users.disabled],[t("m_c77cf23bae"),data.users.deleted],[t("m_af6735b678"),data.summary.activeMembers]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{number(value)}</dd></div>)}</dl><p className="muted">{t("m_d39dd131d4")}</p></section><Ranking title={t("m_a96f24c6d2")} rows={data.roles} value="count"/><Ranking title={t("m_22baa6367b")} rows={data.identities} value="count"/></div>
 <p className="analytics-notes muted">{t("m_083d1616a2")} {data.startedAt?new Date(data.startedAt).toLocaleString(locale,{timeZone:'Asia/Shanghai'}):t("m_ea8861edde")}  {t("m_e3392c8180")}</p>
 </>}
 </div>;
}
