import { useI18n } from '../i18n';
import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import {useAuth} from '../context/AuthContext';
import {ThemeSelect} from './ThemeSelect';
export function NodeMonitorPermission({userId}:{userId:number}){
  const { t } = useI18n();
 const {user}=useAuth();
 const [state,setState]=useState<{allowed:boolean;owner:boolean}|null>(null),[selected,setSelected]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=()=>{setError('');api(`/node-monitor/users/${userId}`).then(r=>{setState(r);setSelected(r.allowed);}).catch(e=>setError(e.message));};
 useEffect(()=>{if(user?.role==='owner')load();},[userId,user?.role]);
 if(user?.role!=='owner')return null;
 async function save(){setBusy(true);setError('');setMessage('');try{const r=await api(`/node-monitor/users/${userId}`,{method:'PUT',body:JSON.stringify({allowed:selected})});setState({allowed:r.allowed,owner:false});setMessage(r.message);}catch(e){setError(e instanceof Error?e.message:t("m_cf1487e7aa"));}finally{setBusy(false);}}
 return <section className="account-section" id="node-monitor-permission"><div><h2>{t("m_7df07e2b2a")}</h2><p>{t("m_6be7e65c9f")}</p></div><div className="account-fields">{error&&<p role="alert">{t(error || '')}{!state&&<button className="text-link" onClick={load}>{t("m_b8784c8dd5")}</button>}</p>}{!state?!error&&<p role="status">{t("m_352a3cf977")}</p>:state.owner?<p>{t("m_d41001a9ff")}</p>:<form className="account-fields" onSubmit={e=>{e.preventDefault();void save();}}><ThemeSelect aria-label={t("m_dd7fab1265")} value={selected?'allowed':'denied'} disabled={busy} onValueChange={v=>{setSelected(v==='allowed');setMessage('');}}><option value="denied">{t("m_568f02c7c8")}</option><option value="allowed">{t("m_0887b6d680")}</option></ThemeSelect><button className="neo-button" disabled={busy||selected===state.allowed}>{busy?t("m_6bdb443509"):t("m_ccfeafc6f0")}</button><p role="status">{t(message || '')}</p></form>}</div></section>;
}
