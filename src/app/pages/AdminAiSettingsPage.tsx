import { useI18n } from '../i18n';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useUnsavedLeave} from '../lib/useUnsavedLeave';
import {api} from '../lib/api';
import {AdminLoading, AdminError, AdminNotice} from '../components/admin/AdminState';
import {ThemeSelect} from '../components/ThemeSelect';
import '../../styles/site-settings.css';
import '../../styles/article-summary-settings.css';
import '../../styles/admin-ai-settings.css';

type AiConfig={enabled:boolean;model:string;has_key:boolean};
export default function AdminAiSettingsPage(){
  const { t } = useI18n();
 const [config,setConfig]=useState<AiConfig|null>(null),[key,setKey]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [loading,setLoading]=useState(true);const saved=useRef<AiConfig|null>(null);
 const load=()=>{setLoading(true);setError('');return api('/article-seo/settings').then(value=>{saved.current=value;setConfig(value);}).catch(e=>setError(e.message)).finally(()=>setLoading(false));};
 useEffect(()=>{void load();},[]);
 async function save(event:FormEvent){
  event.preventDefault();setBusy(true);setError('');setMessage('');
  try{
   const result=await api('/article-seo/settings',{method:'PUT',body:JSON.stringify({...config,api_key:key})});saved.current=result;setConfig(result);
   setKey('');setMessage(t("m_5c975486ce"));
  }catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 const changed=!!config&&(key!==''||config.enabled!==saved.current?.enabled||config.model!==saved.current?.model);
 useUnsavedLeave(changed);
 return <div className="site-settings-page ai-summary-settings">
  <header className="settings-heading"><h1 className="admin-title">{t("m_54531f63f4")}</h1></header>
  <p className="ai-page-description">{t("m_c5747e7b38")}</p>
  {loading?<AdminLoading label={t("m_19dfb53530")} />:!config?<AdminError message={error} onRetry={()=>void load()} />:<form onSubmit={save} className="ai-settings-form">
   <fieldset disabled={busy}>
    <div className="ai-enable-section">
     <label className="article-summary-toggle"><input type="checkbox" checked={config.enabled} aria-describedby="ai-summary-data-hint" onChange={e=>setConfig({...config,enabled:e.target.checked})}/><span>{t("m_a3f0aa474e")}</span></label>
     <p id="ai-summary-data-hint">{t("m_c5b5e8c1d5")}</p>
    </div>
    <div className="settings-field"><span id="ai-model-label">{t("m_c98e118e0a")}</span><ThemeSelect aria-labelledby="ai-model-label" value={config.model} onValueChange={model=>setConfig({...config,model})}>
     <option value="deepseek-flash">DeepSeek Flash</option><option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
    </ThemeSelect></div>
    <label className="settings-field"><span>DeepSeek API Key</span>
     <input aria-label="DeepSeek API Key" type="password" autoComplete="new-password" aria-describedby="ai-summary-key-hint" value={key} onChange={e=>setKey(e.target.value)} placeholder="sk-…" required={config.enabled&&!config.has_key}/>
     <small id="ai-summary-key-hint">{config.has_key&&<span>{t("m_0e2e6663e8")}</span>}<span>{t("m_ff5b3968d3")}</span></small>
    </label>
    <p className="settings-hint" id="ai-summary-behavior">{t("m_5cd924e9da")}</p>
    {error&&<AdminNotice>{t(error)}</AdminNotice>}
    <div className="ai-save-actions"><button className="button-primary" type="submit" disabled={!changed}>{busy?t("m_ff509c9ba0"):t("m_59dbbf0b4b")}</button><button className="quiet-button" type="button" disabled={!changed} onClick={()=>{setConfig(saved.current);setKey('');setError('');setMessage('');}}>{t("m_ef804eda90")}</button><span role="status">{changed?t("m_6265f9d3f3"):message||t("m_1bd91a7d0c")}</span></div>
   </fieldset>
  </form>}
 </div>;
}
