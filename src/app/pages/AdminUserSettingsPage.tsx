import {SiteBack} from '../components/SiteBack';
import {PageHeading} from '../components/ContentUI';
import { useI18n } from '../i18n';
import {NodeMonitorPermission} from '../components/NodeMonitorPermission';
import { notify } from '../lib/feedback';
import { ThemeSelect } from '../components/ThemeSelect';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {Link} from '../components/LocaleLink';
import { api } from '../lib/api';
import { AccountProfileForm, AccountProfile } from '../components/AccountProfileForm';
import '../../styles/account.css';
export default function AdminUserSettingsPage() {
  const { t } = useI18n();
  const { id } = useParams(); const navigate=useNavigate();
  const base=`/admin/users/${id}`;
  const [user,setUser]=useState<AccountProfile|null>(null),[email,setEmail]=useState(''),[confirmation,setConfirmation]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const load=()=>api(`${base}/settings`).then(r=>{setUser(r.user);setEmail(r.user.email);setError('');}).catch(e=>setError(e.message));
  useEffect(()=>{void load();},[id]);
  const run=async(path:string,method:string,body?:object)=>{
    setBusy(true);setMessage('');
    try{const r=await api(path,{method,...(body?{body:JSON.stringify(body)}:{})});notify.success(r.message);if(r.user)setUser(r.user);else await load();return true;}
    catch(e:any){setMessage(e.message);return false;}finally{setBusy(false);}
  };
  return <div className="admin-page"><PageHeading variant="admin" titleClassName="admin-title" title={t("m_7ce710f646")} back={<SiteBack to="/admin/users">{t("m_7232718ecc")}</SiteBack>}/>
    {error?<p role="alert">{t(error || '')}<button onClick={load}>{t("m_b8784c8dd5")}</button></p>:!user?<p role="status">{t("m_21bd738e0d")}</p>:<>
      <p>#{user.id} · {user.username}{user.deleted_at&&<small className="deleted-account-label">{t("m_077a6d3771")}</small>}</p>
      <AccountProfileForm key={user.id} user={user} base={base} onSaved={setUser}/>
      {!user.deleted_at&&<fieldset disabled={busy}>
        <section className="account-section"><div><h2>{t("m_a9eaab0fd8")}</h2><p>{t("m_17423e72d0")}</p></div><form className="account-fields" onSubmit={e=>{e.preventDefault();void run(`${base}/email`,'PUT',{email,version:user.version});}}><label>{t("m_a9eaab0fd8")}<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><button className="neo-button" type="submit">{t("m_32eeab0f9d")}</button></form></section>
        <section className="account-section"><div><h2>{t("m_c8e67e63d5")}</h2><p>{t("m_f6ac1d1c44")}</p></div><form className="account-fields" onSubmit={e=>{e.preventDefault();void run(base,'PUT',{role:user.role,status:user.status,can_comment:user.can_comment});}}>
          <label>{t("m_c47b54e84e")}<ThemeSelect aria-label={t("m_c47b54e84e")} disabled={busy} value={user.role} onValueChange={role=>setUser({...user,role})}><option value="user">{t("m_f6a2faaac2")}</option><option value="editor">{t("m_0518365699")}</option><option value="teacher">{t("m_a6654120cb")}</option><option value="admin">{t("m_e19796712f")}</option><option value="owner">{t("m_b2118962f8")}</option></ThemeSelect></label>
          <label>{t("m_6320b4a872")}<ThemeSelect aria-label={t("m_6320b4a872")} disabled={busy} value={user.status} onValueChange={status=>setUser({...user,status})}><option value="active">{t("m_296de0e31f")}</option><option value="disabled">{t("m_a8c3698b5b")}</option></ThemeSelect></label>
          <label>{t("m_d64dcf669d")}<ThemeSelect aria-label={t("m_d64dcf669d")} disabled={busy} value={String(user.can_comment)} onValueChange={value=>setUser({...user,can_comment:Number(value)})}><option value="1">{t("m_44b31019f7")}</option><option value="0">{t("m_5cd4cc2209")}</option></ThemeSelect></label><button className="neo-button" type="submit">{t("m_6fb73fce60")}</button>
        </form></section>
        <NodeMonitorPermission key={user.id} userId={user.id}/>
        <section className="account-section"><div><h2>{t("m_a621ab606d")}</h2><p>{t("m_4ada4f24bf")}</p></div><button className="neo-button" onClick={()=>void run(`${base}/password-reset`,'POST')}>{t("m_5c8cf9b49f")}</button></section>
        <section className="account-section"><div><h2>{t("m_cd3266d91a")}</h2><p>{t("m_852d1df2d7")}</p></div><form className="account-fields" onSubmit={async e=>{e.preventDefault();if(await run(`${base}/account`,'DELETE',{username:confirmation}))navigate('/admin/users');}}><label>{t("m_0829050518")}{user.username}{t("m_6b71d62943")}<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label><button className="neo-button account-danger" disabled={confirmation!==user.username}>{t("m_cd3266d91a")}</button></form></section>
      </fieldset>}
      {message&&<p role="status" className="account-message">{t(message || '')}</p>}
    </>}
  </div>;
}
