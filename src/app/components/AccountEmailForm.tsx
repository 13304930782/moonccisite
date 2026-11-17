import { useI18n } from '../i18n';
import { FormInput } from './FormInput';
import { ThemeSelect } from './ThemeSelect';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { AccountProfile } from './AccountProfileForm';
export function AccountEmailForm({ user, providers, onSaved }: { user: AccountProfile; providers: {provider:string;name:string;enabled:boolean;bound:boolean}[]; onSaved:(p:AccountProfile)=>void }) {
  const { t } = useI18n();
  const [open,setOpen]=useState(false),[email,setEmail]=useState(''),[code,setCode]=useState(''),[password,setPassword]=useState(''),[challenge,setChallenge]=useState(''),[method,setMethod]=useState('password');
  const [busy,setBusy]=useState<'code'|'confirm'|null>(null),[feedback,setFeedback]=useState<{step:'code'|'confirm';text:string;error:boolean}|null>(null);
  const trigger=useRef<HTMLElement>(null),emailInput=useRef<HTMLInputElement>(null),codeInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(!open)return;const frame=requestAnimationFrame(()=>{(challenge?codeInput:emailInput).current?.focus();});return()=>cancelAnimationFrame(frame);},[open,challenge]);
  const clear=()=>{setEmail('');setCode('');setPassword('');setChallenge('');setMethod('password');};
  const toggle=(next:boolean)=>{if(busy)return;setOpen(next);if(!next){clear();setFeedback(null);trigger.current?.focus();}};
  const run=async(step:'code'|'confirm',work:()=>Promise<void>)=>{if(busy)return;setBusy(step);setFeedback(null);try{await work();}catch(error:any){setFeedback({step,text:error.message,error:true});}finally{setBusy(null);}};
  const notice=(step:'code'|'confirm')=>feedback?.step===step&&<p role={feedback.error?'alert':'status'} className="account-message">{t(feedback.text)}</p>;
  return <div className="account-email"><details className="account-disclosure" open={open} onToggle={event=>{if(event.currentTarget.open!==open)toggle(event.currentTarget.open);}}>
    <summary role="button" ref={trigger} className="account-security-row" aria-label={(open?t('m_4c8ecde1e8'):t('m_5eb350efbf'))+' '+user.email} aria-expanded={open} aria-disabled={!!busy} onClick={event=>{event.preventDefault();toggle(!open);}}><span className="account-security-copy"><strong>{t("m_a9eaab0fd8")}</strong><span className="account-security-value">{user.email}</span></span><span className="neo-button account-disclosure-trigger">{open?t('m_2cd0f3be87'):t('m_916afcd853')}<ChevronDown size={15} aria-hidden="true"/></span></summary>
      <div className="account-email-editor">
        <p className="account-security-help">{t("m_15f431b0fe")}</p>
        <form aria-label={t('m_8723f51312')} onSubmit={event=>{event.preventDefault();void run('code',async()=>{const result=await api('/account/email-code',{method:'POST',body:JSON.stringify({email})});setChallenge(result.challenge_id);setCode('');setPassword('');setFeedback({step:'code',text:result.message,error:false});});}}>
          <fieldset disabled={!!busy} className="account-fields account-email-send"><label>{t("m_3067c39fa4")}<FormInput ref={emailInput} type="email" value={email} onChange={event=>{setEmail(event.target.value);setChallenge('');setCode('');setPassword('');setFeedback(null);}} required autoComplete="email"/></label><button className="neo-button" type="submit" disabled={!email.trim()}>{busy==='code'?t('m_364970d816'):t('m_a7f77bef69')}</button></fieldset>
          {notice('code')}
        </form>
        {challenge&&<form className="account-email-verify" aria-label={t('m_70ec6cccee')} onSubmit={event=>{event.preventDefault();void run('confirm',async()=>{
          const body={challenge_id:challenge,new_code:code,password};
          if(method==='password'){const result=await api('/account/email',{method:'POST',body:JSON.stringify(body)});onSaved(result.user);clear();setOpen(false);setFeedback({step:'confirm',text:result.message,error:false});requestAnimationFrame(()=>trigger.current?.focus());}
          else{const result=await api(`/auth/${method}/start`,{method:'POST',body:JSON.stringify({...body,mode:'email',password:undefined})});window.location.assign(result.url);}
        });}}><fieldset disabled={!!busy} className="account-fields">
          <label>{t("m_098bb2f975")}<FormInput ref={codeInput} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))} required/></label>
          <label>{t("m_6843e70992")}<ThemeSelect aria-label={t("m_6843e70992")} disabled={!!busy} value={method} onValueChange={value=>{setMethod(value);setPassword('');}}><option value="password">{t("m_a114cfb687")}</option>{providers.filter(provider=>provider.bound&&provider.enabled).map(provider=><option key={provider.provider} value={provider.provider}>{t("m_63c8c5365f")} {provider.name}</option>)}</ThemeSelect></label>
          {method==='password'&&<label>{t("m_a114cfb687")}<FormInput type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/></label>}
          <button className="neo-button neo-button-dark" disabled={code.length!==6}>{busy==='confirm'?t('m_c725500abc'):method==='password'?t("m_ffb5adaf63"):t("m_24bd1ea5e1")}</button>
        </fieldset></form>}
      </div>
    </details>{notice('confirm')}
  </div>;
}
