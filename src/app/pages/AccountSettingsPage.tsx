import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { AccountProfileForm, AccountProfile } from '../components/AccountProfileForm';
import { AccountEmailForm } from '../components/AccountEmailForm';
import '../../styles/account.css';
type Provider = { provider:string; name:string; enabled:boolean; bound:boolean };
export default function AccountSettingsPage() {
  const { logout, loggingOut, logoutError, refreshUser }=useAuth();
  const navigate=useNavigate();const [params]=useSearchParams();
  const [user,setUser]=useState<AccountProfile|null>(null),[providers,setProviders]=useState<Provider[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState(params.get('email')==='updated'?'登录邮箱已更新。':params.get('oauth')==='bound'?'账号绑定已更新。':params.get('oauth')==='failed'?'授权未完成，原有绑定保持不变。':''),[challenge,setChallenge]=useState(''),[code,setCode]=useState('');
  const load=async()=>{try{const [p,c]=await Promise.all([api('/account'),api('/auth/connections')]);setUser(p.user);setProviders(c.providers);setError('');}catch(e:any){setError(e.message);}};
  useEffect(()=>{void load();},[]);
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await fn();}catch(e:any){setMessage(e.message);}finally{setBusy(false);}};
  const change=(provider:string,mode:'bind'|'replace'|'unlink')=>run(async()=>{
    const body={mode,challenge_id:challenge,old_code:code};
    if(mode==='unlink') {const r=await api(`/account/connections/${provider}`,{method:'DELETE',body:JSON.stringify(body)});setMessage(r.message);setCode('');setChallenge('');await load();}
    else {const r=await api(`/auth/${provider}/start`,{method:'POST',body:JSON.stringify(body)});window.location.assign(r.url);}
  });
  return <main className="account-page">
    <header className="account-heading"><h1>个人设置</h1><nav><Link to="/">返回网站</Link><button disabled={loggingOut} onClick={async()=>{if(await logout())navigate('/login');}}>{loggingOut?'正在退出…':'退出登录'}</button></nav></header>
    {logoutError&&<p role="alert">{logoutError}</p>}
    {error?<p role="alert">{error}<button className="text-link" onClick={()=>void load()}>重试</button></p>:!user?<p role="status">正在加载个人资料…</p>:<>
      <AccountProfileForm user={user} base="/account" onSaved={p=>{setUser(p);void refreshUser();}}/>
      <AccountEmailForm user={user} providers={providers} onSaved={p=>{setUser(p);void refreshUser();}}/>
      <section className="account-section"><div><h2>密码</h2><p>通过登录邮箱设置或重置密码。</p></div><button className="neo-button" disabled={busy} onClick={()=>void run(async()=>{const r=await api('/account/password-reset',{method:'POST'});setMessage(r.message);})}>发送密码重置链接</button></section>
      <section className="account-section"><div><h2>第三方账号</h2><p>换绑成功前保留原账号。换绑或解绑需要验证当前登录邮箱。</p></div><div>
        <fieldset disabled={busy} className="account-fields"><button className="neo-button" onClick={()=>void run(async()=>{const r=await api('/account/security-code',{method:'POST'});setChallenge(r.challenge_id);setMessage(r.message);setCode('');})}>发送账号变更验证码</button>
          <label>邮箱验证码<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value)} placeholder="换绑 / 解绑时填写"/></label>
        </fieldset>
        {providers.map(p=><div className="account-provider" key={p.provider}><div><strong>{p.name}</strong><p>{p.bound?'已绑定':p.enabled?'未绑定':'暂未开放'}</p></div><div className="account-provider-actions">
          {p.enabled&&<button className="text-link" disabled={busy || (p.bound&&(!challenge||code.length!==6))} onClick={()=>void change(p.provider,p.bound?'replace':'bind')}>{p.bound?'换绑':'绑定'}</button>}
          {p.bound&&<button className="text-link account-danger" disabled={busy||!challenge||code.length!==6} onClick={()=>void change(p.provider,'unlink')}>解绑</button>}
        </div></div>)}
      </div></section>
      {message&&<p className="account-message" role="status">{message}</p>}
    </>}
  </main>;
}
