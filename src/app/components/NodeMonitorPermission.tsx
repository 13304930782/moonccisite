import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import {useAuth} from '../context/AuthContext';
import {ThemeSelect} from './ThemeSelect';
export function NodeMonitorPermission({userId}:{userId:number}){
 const {user}=useAuth();
 const [state,setState]=useState<{allowed:boolean;owner:boolean}|null>(null),[selected,setSelected]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=()=>{setError('');api(`/node-monitor/users/${userId}`).then(r=>{setState(r);setSelected(r.allowed);}).catch(e=>setError(e.message));};
 useEffect(()=>{if(user?.role==='owner')load();},[userId,user?.role]);
 if(user?.role!=='owner')return null;
 async function save(){setBusy(true);setError('');setMessage('');try{const r=await api(`/node-monitor/users/${userId}`,{method:'PUT',body:JSON.stringify({allowed:selected})});setState({allowed:r.allowed,owner:false});setMessage(r.message);}catch(e){setError(e instanceof Error?e.message:'保存失败。');}finally{setBusy(false);}}
 return <section className="account-section" id="node-monitor-permission"><div><h2>节点监控权限</h2><p>允许此用户查看节点状态与资源用量。仅站长可修改。</p></div><div className="account-fields">{error&&<p role="alert">{error}{!state&&<button className="text-link" onClick={load}>重试</button>}</p>}{!state?!error&&<p role="status">正在读取权限…</p>:state.owner?<p>站长始终拥有节点监控权限。</p>:<form className="account-fields" onSubmit={e=>{e.preventDefault();void save();}}><ThemeSelect aria-label="节点监控访问权限" value={selected?'allowed':'denied'} disabled={busy} onValueChange={v=>{setSelected(v==='allowed');setMessage('');}}><option value="denied">不允许访问</option><option value="allowed">允许查看</option></ThemeSelect><button className="neo-button" disabled={busy||selected===state.allowed}>{busy?'正在保存…':'保存监控权限'}</button><p role="status">{message}</p></form>}</div></section>;
}
