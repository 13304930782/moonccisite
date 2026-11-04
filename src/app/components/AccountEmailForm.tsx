import { useI18n } from '../i18n';
import { FormInput } from './FormInput';
import { ThemeSelect } from './ThemeSelect';
import { useState } from 'react';
import { api } from '../lib/api';
import type { AccountProfile } from './AccountProfileForm';
export function AccountEmailForm({ user, providers, onSaved }: { user: AccountProfile; providers: {provider:string;name:string;enabled:boolean;bound:boolean}[]; onSaved:(p:AccountProfile)=>void }) {
  const { t } = useI18n();
  const [email,setEmail]=useState(''),[code,setCode]=useState(''),[password,setPassword]=useState(''),[challenge,setChallenge]=useState(''),[method,setMethod]=useState('password'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await fn();}catch(e:any){setMessage(e.message);}finally{setBusy(false);}};
  return <section className="account-section"><div><h2>{t("m_a9eaab0fd8")}</h2><p>{t("m_6606488056")}{user.email}</p><p>{t("m_15f431b0fe")}</p></div>
    <form onSubmit={e=>{e.preventDefault();void run(async()=>{
      const body={challenge_id:challenge,new_code:code,password};
      if(method==='password'){const r=await api('/account/email',{method:'POST',body:JSON.stringify(body)});onSaved(r.user);setMessage(r.message);setPassword('');setCode('');setChallenge('');setEmail('');}
      else {const r=await api(`/auth/${method}/start`,{method:'POST',body:JSON.stringify({...body,mode:'email',password:undefined})});window.location.assign(r.url);}
    });}}><fieldset disabled={busy} className="account-fields">
      <label>{t("m_3067c39fa4")}<FormInput type="email" value={email} onChange={e=>{setEmail(e.target.value);setChallenge('');setCode('');}} required autoComplete="email"/></label>
      <button className="neo-button" type="button" disabled={!email} onClick={()=>void run(async()=>{const r=await api('/account/email-code',{method:'POST',body:JSON.stringify({email})});setChallenge(r.challenge_id);setMessage(r.message);})}>{t("m_a7f77bef69")}</button>
      <label>{t("m_098bb2f975")}<FormInput inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value)} required/></label>
      <label>{t("m_6843e70992")}<ThemeSelect aria-label={t("m_6843e70992")} disabled={busy} value={method} onValueChange={setMethod}><option value="password">{t("m_a114cfb687")}</option>{providers.filter(p=>p.bound&&p.enabled).map(p=><option key={p.provider} value={p.provider}>{t("m_63c8c5365f")} {p.name}</option>)}</ThemeSelect></label>
      {method==='password'&&<label>{t("m_a114cfb687")}<FormInput type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>}
      <button className="neo-button neo-button-dark" disabled={!challenge||code.length!==6}>{method==='password'?t("m_ffb5adaf63"):t("m_24bd1ea5e1")}</button>
    </fieldset>{message&&<p role="status" className="account-message">{t(message || '')}</p>}</form>
  </section>;
}
