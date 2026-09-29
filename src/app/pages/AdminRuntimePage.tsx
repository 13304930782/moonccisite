import { useEffect, useState } from 'react';
import { api } from '../lib/api';
type Runtime = { checkedAt:string; api:{startedAt:string;node:string}; worker:{state:string;startedAt:string|null;checkedAt:string|null}; deployment:{revision:string|null;completedAt:string|null;result:string}; migrations:{filename:string;executedAt:string}[]|null; disk:{freeBytes:number;totalBytes:number}|null };
const time = (value:string|null) => value ? new Date(value).toLocaleString('zh-CN') : '尚无记录';
export default function AdminRuntimePage() {
 const [data,setData]=useState<Runtime|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;setLoading(true);setError('');api('/admin/runtime').then(value=>{if(active)setData(value);}).catch(e=>{if(active)setError(e.message||'读取失败');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[attempt]);
 return <div className="admin-page analytics-page"><header className="analytics-heading"><div><p className="eyebrow">mooncci / 网站管理</p><h1 className="admin-title">运行信息</h1><p className="muted">核对当前进程与迁移记录。未记录的部署不会推断为已完成。</p></div><div className="analytics-range"><button disabled={loading} onClick={()=>setAttempt(x=>x+1)}>{loading?'正在读取…':'刷新状态'}</button></div></header>
 {error&&<p role="alert">{error}</p>}{data&&<><p className="muted">采集于 {time(data.checkedAt)}</p><div className="analytics-columns">
 <section className="analytics-section"><h2>API</h2><p>启动时间：{time(data.api.startedAt)}</p><p>Node：{data.api.node}</p></section>
 <section className="analytics-section"><h2>后台任务进程</h2><p>{data.worker.state==='running'?'进程存活':data.worker.state==='stopped'?'已停止':'状态未知或心跳已过期'}</p><p>启动：{time(data.worker.startedAt)}</p><p>最近心跳：{time(data.worker.checkedAt)}</p><p className="muted">进程存活不代表每项任务执行成功。</p></section>
 <section className="analytics-section"><h2>最近部署</h2><p style={{overflowWrap:'anywhere'}}>发布包版本：{data.deployment.revision||'尚无可信部署记录'}</p><p>结果：{({success:'成功',failed:'失败','rolled-back':'已回滚'} as Record<string,string>)[data.deployment.result]||'未知'}</p><p>{time(data.deployment.completedAt)}</p></section>
 <section className="analytics-section"><h2>应用所在磁盘</h2><p>{data.disk?`可用 ${(data.disk.freeBytes/1073741824).toFixed(1)} GiB / ${(data.disk.totalBytes/1073741824).toFixed(1)} GiB`:'无法读取'}</p>{data.disk&&data.disk.totalBytes>0&&data.disk.freeBytes/data.disk.totalBytes<0.15&&<p role="alert">可用空间低于 15%，请检查磁盘。</p>}</section></div>
 <section className="analytics-section"><h2>已执行迁移</h2>{data.migrations===null?<p>迁移记录表尚不存在，不能据此判断功能是否已部署。</p>:data.migrations.length===0?<p>暂无记录</p>:<ul>{data.migrations.map(row=><li key={row.filename} style={{overflowWrap:'anywhere',marginBottom:12}}><code>{row.filename}</code><br/><span className="muted">{time(row.executedAt)}</span></li>)}</ul>}</section></>}
 </div>;
}
