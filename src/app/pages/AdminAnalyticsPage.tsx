import {useEffect,useState} from 'react';
import {api} from '../lib/api';
const number=(x:any)=>Number(x||0).toLocaleString('zh-CN');
const labels:Record<string,string>={mobile:'手机',tablet:'平板',desktop:'电脑',direct:'直接访问 / 未提供来源',owner:'站长',admin:'管理员',editor:'编辑',teacher:'教师',user:'普通用户',github:'GitHub',google:'Google',gitee:'Gitee',microsoft:'Microsoft',qq:'QQ',wechat:'微信'};
function Ranking({title,rows,value='views'}:{title:string;rows:any[];value?:string}){return <section className="analytics-section"><h2>{title}</h2>{rows.length?<ol className="analytics-ranking">{rows.map((row,i)=><li key={`${row.label||row.path}-${i}`}><span>{labels[row.label]||row.label||row.path}</span><strong>{number(row[value])}</strong></li>)}</ol>:<p className="muted">暂无数据</p>}</section>;}
export default function AdminAnalyticsPage(){
 const [days,setDays]=useState(30),[data,setData]=useState<any>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setData(null);setError('');api(`/admin/analytics?days=${days}`).then(x=>{if(active)setData(x);}).catch(e=>{if(active)setError(e.message||'加载失败');});return()=>{active=false;};},[days,attempt]);
 const trend=data?.trend||[],max=Math.max(1,...trend.map((x:any)=>x.views));
 return <div className="admin-page analytics-page"><header className="analytics-heading"><div><p className="eyebrow">mooncci / 网站管理</p><h1 className="admin-title">访问统计</h1><p className="muted">了解阅读趋势、访问来源和用户增长。</p></div><div className="analytics-range" aria-label="统计时间范围">{[7,30,90].map(n=><button key={n} aria-pressed={days===n} onClick={()=>setDays(n)}>近 {n} 天</button>)}</div></header>
 {error?<div role="alert">{error} <button className="text-link" onClick={()=>setAttempt(x=>x+1)}>重新加载</button></div>:!data?<p role="status">正在加载统计…</p>:<>
 <div className="analytics-metrics">{[['期间浏览量',data.summary.views],['期间去重访客',data.summary.visitors],['新增注册',trend.reduce((sum:number,x:any)=>sum+x.registrations,0)],['累计浏览量',data.summary.totalViews]].map(([label,value])=><div key={label}><span className="muted">{label}</span><strong>{number(value)}</strong></div>)}</div>
 <section className="analytics-section"><div className="analytics-section-title"><h2>访问趋势</h2><span className="muted">{data.start} — {data.end} · UTC</span></div><div className="analytics-chart" role="img" aria-label={`近${days}天浏览量柱状图，下方可查看每日数据`}>
 {trend.map((x:any)=><div className="analytics-bar-track" key={x.day} title={`${x.day}：${x.views} 次浏览，${x.visitors} 位访客`}><span style={{height:`${x.views/max*100}%`}}/></div>)}
 </div><div className="analytics-axis"><span>{data.start}</span><span>{data.end}</span></div>
 <details className="analytics-daily"><summary>查看每日数据</summary><div className="analytics-table"><div className="analytics-table-row muted"><span>日期</span><span>浏览</span><span>访客</span><span>注册</span></div>{trend.map((x:any)=><div className="analytics-table-row" key={x.day}><span>{x.day}</span><span>{number(x.views)}</span><span>{number(x.visitors)}</span><span>{number(x.registrations)}</span></div>)}</div></details></section>
 <div className="analytics-columns"><Ranking title="热门页面" rows={data.popular}/><Ranking title="访问来源" rows={data.sources}/><Ranking title="访问设备" rows={data.devices}/><section className="analytics-section"><h2>用户概况</h2><dl className="analytics-ranking">{[['正常账号',data.users.active],['停用账号',data.users.disabled],['已删除账号',data.users.deleted],['期间登录访客（按浏览器）',data.summary.activeMembers]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{number(value)}</dd></div>)}</dl><p className="muted">访客按浏览器去重，不等于账号数。</p></section><Ranking title="用户角色" rows={data.roles} value="count"/><Ranking title="第三方账号绑定" rows={data.identities} value="count"/></div>
 <p className="analytics-notes muted">访问统计自 {data.startedAt?new Date(data.startedAt).toLocaleString('zh-CN'):'启用时'} 开始；同一浏览器同一页面 30 秒内重复访问只计一次。排除管理员访问、后台、预览、认证页面及可识别机器人，并尊重浏览器“不跟踪”设置。访客标识保留 90 天，累计浏览量保留；不保存 IP、完整来源网址或搜索词。设备按页面宽度分类，来源取首次外部来源。用户与绑定数量为当前数据，不随时间范围变化；一人可绑定多个平台。</p>
 </>}
 </div>;
}
