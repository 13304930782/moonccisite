import {SiteBack} from '../components/SiteBack';
import {PageHeading} from '../components/ContentUI';
import { useI18n } from '../i18n';
import {NodeMonitorPermission} from '../components/NodeMonitorPermission';
import { notify } from '../lib/feedback';
import { ThemeSelect } from '../components/ThemeSelect';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { AccountProfileForm, AccountProfile } from '../components/AccountProfileForm';
import { useUnsavedLeave } from '../lib/useUnsavedLeave';
import { AdminButton } from '../components/admin/AdminButton';
import { AdminError, AdminLoading } from '../components/admin/AdminState';
import { ChevronDown } from 'lucide-react';
import '../../styles/account.css';
import '../../styles/admin-ui-v2.css';
import '../../styles/admin-users.css';
export default function AdminUserSettingsPage() {
  const { t } = useI18n();
  const { id } = useParams(); const navigate=useNavigate();
  const base=`/admin/users/${id}`;
  const [user,setUser]=useState<AccountProfile|null>(null),[email,setEmail]=useState(''),[confirmation,setConfirmation]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [permissions,setPermissions]=useState<Pick<AccountProfile,'role'|'status'|'can_comment'>|null>(null);
  const [feedbackFor,setFeedbackFor]=useState('');
  const permissionValues=permissions||user;
  const permissionsChanged=Boolean(user&&permissions&&(permissions.role!==user.role||permissions.status!==user.status||permissions.can_comment!==user.can_comment));
  const feedback=(path:string)=>message&&feedbackFor===path?<p role="alert" className="account-message">{t(message)}</p>:null;
  useUnsavedLeave(Boolean(user && (email!==user.email || (permissions && (permissions.role!==user.role || permissions.status!==user.status || permissions.can_comment!==user.can_comment)))));
  const load=(resetDrafts=true)=>api(`${base}/settings`).then(r=>{setUser(r.user);if(resetDrafts){setEmail(r.user.email);setPermissions(null);}setError('');return r.user;});
  useEffect(()=>{void load().catch(e=>setError(e.message));},[id]);
  const run=async(path:string,method:string,body?:object)=>{
    setBusy(true);setMessage('');setFeedbackFor(path);
    try{const r=await api(path,{method,...(body?{body:JSON.stringify(body)}:{})});notify.success(r.message);const updated=r.user||await load(false);if(updated){setUser(updated);if(path===`${base}/email`)setEmail(updated.email);if(path===base&&method==='PUT')setPermissions(null);}return true;}
    catch(e:any){setMessage(e.message);return false;}finally{setBusy(false);}
  };
  return <div className="admin-page admin-user-settings ui-v2"><PageHeading variant="admin" className="admin-users-heading" titleClassName="admin-title" title={t("m_7ce710f646")} back={<SiteBack to="/admin/users">{t("m_7232718ecc")}</SiteBack>}/>
    {error?<AdminError message={error} onRetry={()=>void load().catch(e=>setError(e.message))}/>:!user?<AdminLoading label={t("m_21bd738e0d")}/>:<>
      <div className="admin-user-identity"><strong>{user.username}</strong><span>#{user.id}</span><span>{user.email}</span>{user.deleted_at&&<small className="deleted-account-label">{t("m_077a6d3771")}</small>}</div>
      <div className="admin-user-settings-stack"><AccountProfileForm inlineFeedback={!user.deleted_at} key={user.id} user={user} base={base} onSaved={setUser}/>
      {!user.deleted_at&&<fieldset disabled={busy} className="admin-user-edit-sections" aria-busy={busy}>
        <section className="account-section"><div><h2>{t("m_a9eaab0fd8")}</h2><p>{t("m_17423e72d0")}</p></div><form className="account-fields admin-user-email-fields" onSubmit={e=>{e.preventDefault();void run(`${base}/email`,'PUT',{email,version:user.version});}}><label>{t("m_a9eaab0fd8")}<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><AdminButton variant="soft" disabled={busy||email===user.email} type="submit">{busy&&feedbackFor===`${base}/email`?t('m_ff509c9ba0'):t("m_32eeab0f9d")}</AdminButton>{feedback(`${base}/email`)}</form></section>
        <section className="account-section"><div><h2>{t("m_c8e67e63d5")}</h2><p>{t("m_f6ac1d1c44")}</p></div><form className="account-fields admin-user-permission-fields" onSubmit={e=>{e.preventDefault();void run(base,'PUT',{role:permissionValues!.role,status:permissionValues!.status,can_comment:permissionValues!.can_comment});}}>
          <label className="admin-user-role-field">{t("m_c47b54e84e")}<ThemeSelect compact aria-label={t("m_c47b54e84e")} disabled={busy} value={permissionValues!.role} onValueChange={role=>setPermissions({role,status:permissionValues!.status,can_comment:permissionValues!.can_comment})}><option value="user">{t("m_f6a2faaac2")}</option><option value="editor">{t("m_0518365699")}</option><option value="teacher">{t("m_a6654120cb")}</option><option value="admin">{t("m_e19796712f")}</option><option value="owner">{t("m_b2118962f8")}</option></ThemeSelect></label>
          <label>{t("m_6320b4a872")}<ThemeSelect aria-label={t("m_6320b4a872")} disabled={busy} value={permissionValues!.status} onValueChange={status=>setPermissions({role:permissionValues!.role,status,can_comment:permissionValues!.can_comment})}><option value="active">{t("m_296de0e31f")}</option><option value="disabled">{t("m_a8c3698b5b")}</option></ThemeSelect></label>
          <label>{t("m_d64dcf669d")}<ThemeSelect aria-label={t("m_d64dcf669d")} disabled={busy} value={String(permissionValues!.can_comment)} onValueChange={value=>setPermissions({role:permissionValues!.role,status:permissionValues!.status,can_comment:Number(value)})}><option value="1">{t("m_44b31019f7")}</option><option value="0">{t("m_5cd4cc2209")}</option></ThemeSelect></label><AdminButton variant="soft" disabled={busy||!permissionsChanged} type="submit">{busy&&feedbackFor===base?t('m_ff509c9ba0'):t("m_6fb73fce60")}</AdminButton>{feedback(base)}
        </form></section>
        <NodeMonitorPermission key={user.id} userId={user.id}/>
        <section className="account-section"><div><h2>{t("m_a621ab606d")}</h2><p>{t("m_4ada4f24bf")}</p></div><div className="account-fields"><AdminButton type="button" variant="soft" onClick={()=>void run(`${base}/password-reset`,'POST')}>{busy&&feedbackFor===`${base}/password-reset`?t('处理中…'):t("m_5c8cf9b49f")}</AdminButton>{feedback(`${base}/password-reset`)}</div></section>
        <details className="admin-user-danger"><summary><span>{t("m_cd3266d91a")}</span><ChevronDown size={16} aria-hidden="true"/></summary><section className="account-section"><div><p>{t("m_852d1df2d7")}</p></div><form className="account-fields" onSubmit={async e=>{e.preventDefault();if(await run(`${base}/account`,'DELETE',{username:confirmation}))navigate('/admin/users');}}><label>{t("m_0829050518")}{user.username}{t("m_6b71d62943")}<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label><AdminButton type="submit" variant="soft" className="ui-btn--danger" disabled={busy||confirmation!==user.username}>{t("m_cd3266d91a")}</AdminButton>{feedback(`${base}/account`)}</form></section></details>
      </fieldset>}
      </div>
    </>}
  </div>;
}
