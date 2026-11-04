import { useI18n } from '../i18n';
import {useEffect,useState} from 'react';

import {Link} from '../components/LocaleLink';
import {ArrowUpRight,Users} from 'lucide-react';
import {useUnsavedLeave} from '../lib/useUnsavedLeave';
import {api} from '../lib/api';
import '../../styles/node-monitor.css';
export default function AdminNodeMonitorPage(){
  const { t } = useI18n();
 const [loaded,setLoaded]=useState(false),[configured,setConfigured]=useState(false),[key,setKey]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=()=>{setError('');api('/node-monitor/settings').then(c=>{setConfigured(c.configured);setLoaded(true);}).catch(e=>setError(e.message));};
 useEffect(load,[]);
 useUnsavedLeave(Boolean(key));
 async function save(){setSaving(true);setError('');setMessage('');try{await api('/node-monitor/settings',{method:'PUT',body:JSON.stringify({apiKey:key})});setKey('');setConfigured(true);setMessage(t("m_6acff2ee4e"));}catch(e){setError(e instanceof Error?e.message:t("m_cf1487e7aa"));}finally{setSaving(false);}}
 return <div className="node-page node-settings"><header className="workspace-heading"><div><span className="workspace-eyebrow">{t("m_95dbef1fb4")}</span><h1>{t("m_62132614a1")}</h1><p>{t("m_04c1b29460")}</p></div><Link className="node-button" to="/node-monitor">{t("m_2e9f2327bd")}<ArrowUpRight size={16} aria-hidden="true"/></Link></header>
 {error&&<p className="node-notice" role="alert">{t(error || '')}</p>}{!loaded?<div className="node-panel"><p>{error?t("m_38b8756a83"):t("m_69ede7ee41")}</p>{error&&<button className="node-button" onClick={load}>{t("m_7bdd5ce1e2")}</button>}</div>:<>
 <section className="node-panel" aria-labelledby="node-connection"><div className="node-section-heading"><div><h2 id="node-connection">{t("m_bab659d652")}</h2><p>{t("m_74a63d9ef8")}</p></div><span className="node-state">{configured?t("m_de8184da1e"):t("m_80a57e03f0")}</span></div><form onSubmit={e=>{e.preventDefault();void save();}}><div className="node-fields"><div><span className="node-label">{t("m_02739d1bae")}</span><p className="node-origin">https://komari.mooncci.site:9443</p></div><label htmlFor="monitor-key">{t("m_5f600b307b")}<input id="monitor-key" type="password" autoComplete="new-password" disabled={saving} value={key} onChange={e=>{setKey(e.target.value);setMessage('');}} placeholder={configured?t("m_df8eea2ca5"):t("m_5d8bbcdfc4")} aria-describedby="monitor-key-help"/><small id="monitor-key-help">{t("m_1f264353b2")}</small></label></div><div className="node-save"><p role="status">{key?t("m_6265f9d3f3"):message}</p><button type="button" className="node-button" disabled={saving||!key} onClick={()=>{setKey('');setError('');setMessage('');}}>{t("m_ef804eda90")}</button><button className="node-button node-primary" disabled={saving||!key}>{saving?t("m_664ada2ce4"):t("m_f5dede740e")}</button></div></form></section>
 <section className="node-panel node-permission-link" aria-labelledby="node-permissions"><div><h2 id="node-permissions">{t("m_1ab7161933")}</h2><p>{t("m_49dc850ca2")}</p></div><Link className="node-button" to="/admin/users"><Users size={16} aria-hidden="true"/>{t("m_e09366144c")}<ArrowUpRight size={16} aria-hidden="true"/></Link></section></>}
 </div>;
}
