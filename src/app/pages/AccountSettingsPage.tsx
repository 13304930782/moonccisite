import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
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
 const {refreshUser}=useAuth(),[params]=useSearchParams();
 const [user,setUser]=useState<AccountProfile|null>(null),[providers,setProviders]=useState<Provider[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [passwordMessage,setPasswordMessage]=useState(''),[socialMessage,setSocialMessage]=useState('');
 const [target,setTarget]=useState<{provider:Provider;mode:'replace'|'unlink'}|null>(null),[challenge,setChallenge]=useState(''),[code,setCode]=useState(''),[dialogMessage,setDialogMessage]=useState(''),[dialogError,setDialogError]=useState(''),[resendAt,setResendAt]=useState(0),[now,setNow]=useState(Date.now());
 const callbackMessage=params.get('email')==='updated'?'登录邮箱已更新。':params.get('oauth')==='bound'?'账号绑定已更新。':params.get('oauth')==='failed'?(oauthReasons[params.get('reason')||'']||'授权未完成，原有绑定保持不变。'):'';
 const load=async()=>{try{const [p,c]=await Promise.all([api('/account'),api('/auth/connections')]);setUser(p.user);setProviders(c.providers);setError('');}catch(e:any){setError(e.message);}};
 useEffect(()=>{void load();},[]);
 useEffect(()=>{if(!target)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[target]);
 async function sendCode(){setBusy(true);setDialogError('');try{const r=await api('/account/security-code',{method:'POST'});setChallenge(r.challenge_id);setCode('');setDialogMessage('验证码已发送至 '+user?.email+'，请在下方填写。');setResendAt(Date.now()+60000);setNow(Date.now());}catch(e:any){setDialogError(e.message);}finally{setBusy(false);}}
 async function start(p:Provider,mode:'bind'|'replace'|'unlink'){
  setSocialMessage('');
  if(mode!=='bind'){setTarget({provider:p,mode});setCode('');setChallenge('');setDialogMessage('');setDialogError('');if(resendAt<=Date.now())await sendCode();else setDialogMessage('请稍候再发送验证码，原有绑定保持不变。');return;}
  setBusy(true);try{const r=await api('/auth/'+p.provider+'/start',{method:'POST',body:JSON.stringify({mode})});window.location.assign(r.url);}catch(e:any){setSocialMessage(e.message);}finally{setBusy(false);}
 }
 async function confirmChange(){if(!target)return;setBusy(true);setDialogError('');try{const body={mode:target.mode,challenge_id:challenge,old_code:code};
  if(target.mode==='unlink'){const r=await api('/account/connections/'+target.provider.provider,{method:'DELETE',body:JSON.stringify(body)});setSocialMessage(r.message||target.provider.name+' 已解绑。');setTarget(null);setCode('');setChallenge('');await load();}
  else{const r=await api('/auth/'+target.provider.provider+'/start',{method:'POST',body:JSON.stringify(body)});window.location.assign(r.url);}
 }catch(e:any){setDialogError(e.message);}finally{setBusy(false);}}
 async function resetPassword(){setBusy(true);setPasswordMessage('');try{const r=await api('/account/password-reset',{method:'POST'});setPasswordMessage((r.message||'重置链接已发送。')+' 请打开登录邮箱中的邮件继续设置密码。');}catch(e:any){setPasswordMessage(e.message);}finally{setBusy(false);}}
 return <section className="account-page"><header className="account-page-heading"><div><span className="account-eyebrow">账户管理</span><h1>账号设置</h1><p>管理个人资料、登录方式与账户安全。</p></div></header>
 {callbackMessage&&<p className="account-message" role="status">{callbackMessage}</p>}
 {error?<p role="alert">{error}<button className="text-link" onClick={()=>void load()}>重试</button></p>:!user?<p role="status">正在加载个人资料…</p>:<>
 <AccountProfileForm user={user} base="/account" onSaved={p=>{setUser(p);void refreshUser();}}/>
 <AccountEmailForm user={user} providers={providers} onSaved={p=>{setUser(p);void refreshUser();}}/>
 <section className="account-section"><div><h2>密码</h2><p>通过登录邮箱设置或重置密码。</p></div><div><button className="neo-button" disabled={busy} onClick={()=>void resetPassword()}>发送密码重置链接</button>{passwordMessage&&<p className="account-message" role="status">{passwordMessage}</p>}</div></section>
 <section className="account-section"><div><h2>第三方账号</h2><p>选择要管理的登录方式。换绑或解绑时会引导你验证当前邮箱。</p></div><div>{socialMessage&&<p className="account-message" role="status">{socialMessage}</p>}
 {providers.map(p=><div className="account-provider" key={p.provider}><div><strong>{p.name}</strong><p>{p.bound?'已绑定':p.enabled?'未绑定':'暂未开放'}</p></div><div className="account-provider-actions">{p.enabled&&<button className="text-link" disabled={busy} onClick={()=>void start(p,p.bound?'replace':'bind')}>{p.bound?'换绑':'绑定'} {p.name}</button>}{p.bound&&<button className="text-link account-danger" disabled={busy} onClick={()=>void start(p,'unlink')}>解绑 {p.name}</button>}</div></div>)}
 </div></section></>}
 <Dialog open={!!target} onOpenChange={open=>{if(!open&&!busy)setTarget(null);}}><DialogContent className="workspace-form-dialog"><DialogTitle>{target?.mode==='replace'?'换绑':'解绑'} {target?.provider.name}</DialogTitle><DialogDescription>{target?.mode==='replace'?'先验证当前邮箱，再前往授权新的账号；完成前保留原绑定。':'验证后解除这一登录方式，邮箱密码和其他绑定不受影响。'}</DialogDescription>{dialogMessage&&<p role="status">{dialogMessage}</p>}{dialogError&&<p role="alert">{dialogError}</p>}
 {challenge&&<label>邮箱验证码<input autoFocus autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="输入 6 位验证码"/></label>}
 <div className="inline-actions"><button className="account-primary-button" disabled={busy||!challenge||code.length!==6} onClick={()=>void confirmChange()}>{busy?'正在处理…':target?.mode==='replace'?'验证并前往授权':'验证并确认解绑'}</button><button className="neo-button" disabled={busy||resendAt>now} onClick={()=>void sendCode()}>{resendAt>now?Math.ceil((resendAt-now)/1000)+' 秒后可重发':challenge?'重新发送验证码':'发送验证码'}</button></div></DialogContent></Dialog>
 </section>;
}
