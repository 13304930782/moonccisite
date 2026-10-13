import {useEffect,useRef,useState,type FormEvent} from 'react';
import {api} from '../lib/api';
import {ThemeSelect} from '../components/ThemeSelect';
import '../../styles/site-settings.css';
import '../../styles/article-summary-settings.css';

type AiConfig={enabled:boolean;model:string;has_key:boolean};
export default function AdminAiSettingsPage(){
 const [config,setConfig]=useState<AiConfig|null>(null),[key,setKey]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [loading,setLoading]=useState(true);const saved=useRef<AiConfig|null>(null);
 const load=()=>{setLoading(true);setError('');return api('/article-seo/settings').then(value=>{saved.current=value;setConfig(value);}).catch(e=>setError(e.message)).finally(()=>setLoading(false));};
 useEffect(()=>{void load();},[]);
 async function save(event:FormEvent){
  event.preventDefault();setBusy(true);setError('');setMessage('');
  try{
   const result=await api('/article-seo/settings',{method:'PUT',body:JSON.stringify({...config,api_key:key})});saved.current=result;setConfig(result);
   setKey('');setMessage('设置已保存。可在文章编辑页生成简介，验证密钥和余额。');
  }catch(e:any){setError(e.message);}finally{setBusy(false);}
 }
 const changed=!!config&&(key.trim()!==''||config.enabled!==saved.current?.enabled||config.model!==saved.current?.model);
 return <div className="site-settings-page ai-summary-settings">
  <header className="settings-heading"><h1 className="admin-title">AI 文章简介</h1></header>
  <p>用 DeepSeek 根据正文自动总结，生成结果同时用于文章简介和搜索描述。发布前可以预览或改为手写。</p>
  {loading?<p role="status">正在读取 AI 设置…</p>:!config?<><p role="alert">{error}</p><button className="quiet-button" onClick={()=>void load()}>重新加载设置</button></>:<form onSubmit={save} className="settings-section">
   <div className="settings-section-heading"><h2>DeepSeek</h2><p>生成时发送文章标题、分类、标签和正文，并产生 API 费用。不会发送作者账号、邮箱或站点登录信息。</p></div>
   <fieldset disabled={busy}>
    <label className="article-summary-toggle"><input type="checkbox" checked={config.enabled} aria-describedby="ai-summary-behavior" onChange={e=>setConfig({...config,enabled:e.target.checked})}/><span>启用自动总结</span></label>
    <label className="settings-field"><span>模型</span><ThemeSelect aria-label="DeepSeek 模型" value={config.model} onValueChange={model=>setConfig({...config,model})}>
     <option value="deepseek-flash">DeepSeek Flash</option><option value="deepseek-v4-pro">DeepSeek V4 Pro</option>
    </ThemeSelect></label>
    <label className="settings-field"><span>DeepSeek API Key</span>
     <input aria-label="DeepSeek API Key" type="password" autoComplete="new-password" aria-describedby="ai-summary-key-hint" value={key} onChange={e=>setKey(e.target.value)} placeholder={config.has_key?'已配置；留空保留现有密钥':'sk-…'} required={config.enabled&&!config.has_key}/>
     <small id="ai-summary-key-hint">密钥仅保存在服务器，后台不会显示原值。</small>
    </label>
    <p className="settings-hint" id="ai-summary-behavior">每个账号每分钟最多生成三次。保存草稿不会调用 AI；正文修改后会在下一次预览或提交时更新简介。</p>
    {error&&<p className="article-summary-error" role="alert">{error}</p>}
    <div className="settings-save"><button className="button-primary" type="submit" disabled={!changed}>{busy?'保存中…':'保存 AI 设置'}</button><span role="status">{message}</span></div>
   </fieldset>
  </form>}
 </div>;
}
