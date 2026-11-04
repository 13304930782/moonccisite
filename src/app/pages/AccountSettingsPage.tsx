import { useI18n } from '../i18n';
import {useEffect,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Link} from '../components/LocaleLink';
import {useAuth} from '../context/AuthContext';
import {api} from '../lib/api';
import {AccountProfileForm,AccountProfile} from '../components/AccountProfileForm';
import {AccountEmailForm} from '../components/AccountEmailForm';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../components/ui/dialog';
import '../../styles/account.css';
import '../../styles/workspace-polish.css';
const oauthReasons:Record<string,string>={proxy_config_invalid:'GitHub 代理配置不完整或格式不正确，请联系管理员。',already_bound:'该第三方账号已绑定其他网站账号。',session_expired:'登录会话已失效，请重新登录后绑定。',config_changed:'登录配置发生变化，请重新发起绑定。',provider_rejected:'第三方平台拒绝了授权交换，请核对应用配置。',provider_http:'第三方接口返回错误，请稍后重试。',provider_timeout:'第三方接口请求超时，请重新发起绑定。',provider_network:'服务器连接第三方接口失败。',authorization_denied:'授权未完成，请重新发起绑定。'};
type Provider={provider:string;name:string;enabled:boolean;bound:boolean};
export default function AccountSettingsPage(){
  const { t } = useI18n();
 const {refreshUser}=useAuth(),[params]=useSearchParams();
 const [user,setUser]=useState<AccountProfile|null>(null),[providers,setProviders]=useState<Provider[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [passwordMessage,setPasswordMessage]=useState(''),[socialMessage,setSocialMessage]=useState('');
 const [target,setTarget]=useState<{provider:Provider;mode:'replace'|'unlink'}|null>(null),[challenge,setChallenge]=useState(''),[code,setCode]=useState(''),[dialogMessage,setDialogMessage]=useState(''),[dialogError,setDialogError]=useState(''),[resendAt,setResendAt]=useState(0),[now,setNow]=useState(Date.now());
 const callbackMessage=params.get('email')==='updated'?t("m_83ec2b550d"):params.get('oauth')==='bound'?t("m_a30ec369af"):params.get('oauth')==='failed'?(oauthReasons[params.get('reason')||'']||t("m_3104f8a6ff")):'';
 const load=async()=>{try{const [p,c]=await Promise.all([api('/account'),api('/auth/connections')]);setUser(p.user);setProviders(c.providers);setError('');}catch(e:any){setError(e.message);}};
 useEffect(()=>{void load();},[]);
 useEffect(()=>{if(!target)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[target]);
 async function sendCode(){setBusy(true);setDialogError('');try{const r=await api('/account/security-code',{method:'POST'});setChallenge(r.challenge_id);setCode('');setDialogMessage(t("m_f84eaf2621")+user?.email+t("m_3be5b82719"));setResendAt(Date.now()+60000);setNow(Date.now());}catch(e:any){setDialogError(e.message);}finally{setBusy(false);}}
 async function start(p:Provider,mode:'bind'|'replace'|'unlink'){
  setSocialMessage('');
  if(mode!=='bind'){setTarget({provider:p,mode});setCode('');setChallenge('');setDialogMessage('');setDialogError('');if(resendAt<=Date.now())await sendCode();else setDialogMessage(t("m_3cb2f410cb"));return;}
  setBusy(true);try{const r=await api('/auth/'+p.provider+'/start',{method:'POST',body:JSON.stringify({mode})});window.location.assign(r.url);}catch(e:any){setSocialMessage(e.message);}finally{setBusy(false);}
 }
 async function confirmChange(){if(!target)return;setBusy(true);setDialogError('');try{const body={mode:target.mode,challenge_id:challenge,old_code:code};
  if(target.mode==='unlink'){const r=await api('/account/connections/'+target.provider.provider,{method:'DELETE',body:JSON.stringify(body)});setSocialMessage(r.message||target.provider.name+t("m_af1670f2b6"));setTarget(null);setCode('');setChallenge('');await load();}
  else{const r=await api('/auth/'+target.provider.provider+'/start',{method:'POST',body:JSON.stringify(body)});window.location.assign(r.url);}
 }catch(e:any){setDialogError(e.message);}finally{setBusy(false);}}
 async function resetPassword(){setBusy(true);setPasswordMessage('');try{const r=await api('/account/password-reset',{method:'POST'});setPasswordMessage((r.message||t("m_77691636d8"))+t("m_099b98c292"));}catch(e:any){setPasswordMessage(e.message);}finally{setBusy(false);}}
 return <section className="account-page"><header className="account-page-heading"><div><span className="account-eyebrow">{t("m_3c07271224")}</span><h1>{t("m_5ce662ac8d")}</h1><p>{t("m_a5fb1014c9")}</p></div></header>
 {callbackMessage&&<p className="account-message" role="status">{callbackMessage}</p>}
 {error?<p role="alert">{t(error || '')}<button className="text-link" onClick={()=>void load()}>{t("m_b8784c8dd5")}</button></p>:!user?<p role="status">{t("m_503bfab44b")}</p>:<>
 <AccountProfileForm user={user} base="/account" onSaved={p=>{setUser(p);void refreshUser();}}/>
 <AccountEmailForm user={user} providers={providers} onSaved={p=>{setUser(p);void refreshUser();}}/>
 <section className="account-section"><div><h2>{t("m_a621ab606d")}</h2><p>{t("m_572517bd43")}</p></div><div><button className="neo-button" disabled={busy} onClick={()=>void resetPassword()}>{t("m_5c8cf9b49f")}</button>{passwordMessage&&<p className="account-message" role="status">{passwordMessage}</p>}</div></section>
 <section className="account-section"><div><h2>{t("m_94b52a856b")}</h2><p>{t("m_9659613ee2")}</p></div><div>{socialMessage&&<p className="account-message" role="status">{socialMessage}</p>}
 {providers.map(p=><div className="account-provider" key={p.provider}><div><strong>{p.name}</strong><p>{p.bound?t("m_f70c0007f3"):p.enabled?t("m_e026c6693d"):t("m_98c9b122a6")}</p></div><div className="account-provider-actions">{p.enabled&&<button className="text-link" disabled={busy} onClick={()=>void start(p,p.bound?'replace':'bind')}>{p.bound?t("m_eaf366b778"):t("m_3dd97f4d27")} {p.name}</button>}{p.bound&&<button className="text-link account-danger" disabled={busy} onClick={()=>void start(p,'unlink')}>{t("m_3ba0a291df")} {p.name}</button>}</div></div>)}
 </div></section></>}
 <Dialog open={!!target} onOpenChange={open=>{if(!open&&!busy)setTarget(null);}}><DialogContent className="workspace-form-dialog"><DialogTitle>{target?.mode==='replace'?t("m_eaf366b778"):t("m_3ba0a291df")} {target?.provider.name}</DialogTitle><DialogDescription>{target?.mode==='replace'?t("m_60c246375b"):t("m_c9afae0d29")}</DialogDescription>{dialogMessage&&<p role="status">{dialogMessage}</p>}{dialogError&&<p role="alert">{dialogError}</p>}
 {challenge&&<label>{t("m_3acdd163e6")}<input autoFocus autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder={t("m_a8d7dd5511")}/></label>}
 <div className="inline-actions"><button className="account-primary-button" disabled={busy||!challenge||code.length!==6} onClick={()=>void confirmChange()}>{busy?t("m_574ec7517d"):target?.mode==='replace'?t("m_5a8e57877a"):t("m_40806d9407")}</button><button className="neo-button" disabled={busy||resendAt>now} onClick={()=>void sendCode()}>{resendAt>now?Math.ceil((resendAt-now)/1000)+t("m_1a8c93622c"):challenge?t("m_e9dce4eec6"):t("m_4656fed515")}</button></div></DialogContent></Dialog>
 </section>;
}
