import { useState } from 'react';
import { api } from '../lib/api';
import type { AccountProfile } from './AccountProfileForm';
export function AccountEmailForm({ user, providers, onSaved }: { user: AccountProfile; providers: {provider:string;name:string;enabled:boolean;bound:boolean}[]; onSaved:(p:AccountProfile)=>void }) {
  const [email,setEmail]=useState(''),[code,setCode]=useState(''),[password,setPassword]=useState(''),[challenge,setChallenge]=useState(''),[method,setMethod]=useState('password'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await fn();}catch(e:any){setMessage(e.message);}finally{setBusy(false);}};
  return <section className="account-section"><div><h2>登录邮箱</h2><p>当前：{user.email}</p><p>验证新邮箱，再用当前密码或已绑定账号确认身份。</p></div>
    <form onSubmit={e=>{e.preventDefault();void run(async()=>{
      const body={challenge_id:challenge,new_code:code,password};
      if(method==='password'){const r=await api('/account/email',{method:'POST',body:JSON.stringify(body)});onSaved(r.user);setMessage(r.message);setPassword('');setCode('');setChallenge('');setEmail('');}
      else {const r=await api(`/auth/${method}/start`,{method:'POST',body:JSON.stringify({...body,mode:'email',password:undefined})});window.location.assign(r.url);}
    });}}><fieldset disabled={busy} className="account-fields">
      <label>新邮箱<input type="email" value={email} onChange={e=>{setEmail(e.target.value);setChallenge('');setCode('');}} required autoComplete="email"/></label>
      <button className="neo-button" type="button" disabled={!email} onClick={()=>void run(async()=>{const r=await api('/account/email-code',{method:'POST',body:JSON.stringify({email})});setChallenge(r.challenge_id);setMessage(r.message);})}>发送验证码到新邮箱</button>
      <label>新邮箱验证码<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value)} required/></label>
      <label>确认身份的方式<select value={method} onChange={e=>setMethod(e.target.value)}><option value="password">当前密码</option>{providers.filter(p=>p.bound&&p.enabled).map(p=><option key={p.provider} value={p.provider}>重新授权已绑定的 {p.name}</option>)}</select></label>
      {method==='password'&&<label>当前密码<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>}
      <button className="neo-button neo-button-dark" disabled={!challenge||code.length!==6}>{method==='password'?'确认更换邮箱':'前往授权并更换邮箱'}</button>
    </fieldset>{message&&<p role="status" className="account-message">{message}</p>}</form>
  </section>;
}
