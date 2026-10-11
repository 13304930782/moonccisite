import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowUpRight,Users} from 'lucide-react';
import {api} from '../lib/api';
import '../../styles/node-monitor.css';
export default function AdminNodeMonitorPage(){
 const [loaded,setLoaded]=useState(false),[configured,setConfigured]=useState(false),[key,setKey]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=()=>{setError('');api('/node-monitor/settings').then(c=>{setConfigured(c.configured);setLoaded(true);}).catch(e=>setError(e.message));};
 useEffect(load,[]);
 async function save(){setSaving(true);setError('');setMessage('');try{await api('/node-monitor/settings',{method:'PUT',body:JSON.stringify({apiKey:key})});setKey('');setConfigured(true);setMessage('连接配置已保存。');}catch(e){setError(e instanceof Error?e.message:'保存失败。');}finally{setSaving(false);}}
 return <div className="node-page node-settings"><header className="workspace-heading"><div><span className="workspace-eyebrow">站点与系统</span><h1>节点监控设置</h1><p>配置 Komari 连接与节点数据来源。</p></div><Link className="node-button" to="/node-monitor">查看监控<ArrowUpRight size={16} aria-hidden="true"/></Link></header>
 {error&&<p className="node-notice" role="alert">{error}</p>}{!loaded?<div className="node-panel"><p>{error?'设置加载失败。':'正在加载设置…'}</p>{error&&<button className="node-button" onClick={load}>重新加载</button>}</div>:<>
 <section className="node-panel" aria-labelledby="node-connection"><div className="node-section-heading"><div><h2 id="node-connection">Komari 连接</h2><p>密钥仅由网站后端加密保存。</p></div><span className="node-state">{configured?'已配置':'未配置'}</span></div><form onSubmit={e=>{e.preventDefault();void save();}}><div className="node-fields"><div><span className="node-label">服务地址</span><p className="node-origin">https://komari.mooncci.site:8443</p></div><label htmlFor="monitor-key">API 密钥<input id="monitor-key" type="password" autoComplete="new-password" disabled={saving} value={key} onChange={e=>{setKey(e.target.value);setMessage('');}} placeholder={configured?'输入新密钥以替换现有配置':'输入 Komari API 密钥'} aria-describedby="monitor-key-help"/><small id="monitor-key-help">保存前将验证连接；验证失败时保留原配置。</small></label></div><div className="node-save"><p role="status">{message}</p><button className="node-button node-primary" disabled={saving||!key}>{saving?'正在验证并保存…':'保存连接'}</button></div></form></section>
 <section className="node-panel node-permission-link" aria-labelledby="node-permissions"><div><h2 id="node-permissions">用户权限</h2><p>在用户管理中设置节点监控权限。站长始终可用，管理员需单独授权。</p></div><Link className="node-button" to="/admin/users"><Users size={16} aria-hidden="true"/>管理用户权限<ArrowUpRight size={16} aria-hidden="true"/></Link></section></>}
 </div>;
}
