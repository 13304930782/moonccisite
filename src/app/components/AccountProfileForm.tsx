import { useI18n } from '../i18n';
import { FormInput } from './FormInput';
import { notify } from '../lib/feedback';
import { useState, useRef } from 'react';
import { api } from '../lib/api';
import { safeImageSrc } from '../lib/safeUrl';
export type AccountProfile = { id: number; username: string; email: string; avatar_url?: string; deleted_at?: string; role: string; status: string; can_comment: number; version: number };
export function AccountProfileForm({ user, base, onSaved }: { user: AccountProfile; base: string; onSaved: (user: AccountProfile) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(user.username), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const uploadController = useRef<AbortController | null>(null);
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true); setMessage(''); uploadController.current = new AbortController();
    try { const data = new FormData(); data.append('avatar', file); const result = await api(`${base}/avatar`, {method:'POST',body:data,signal:uploadController.current.signal}); onSaved(result.user); notify.success(result.message); }
    catch(e:any) { setMessage(e.message); notify.error(e.message); } finally { uploadController.current = null; setBusy(false); }
  };
  return <section className="account-section">
    <div><h2>{t("m_b94d13a45e")}</h2><p>{t("m_82ea0e8770")}</p></div>
    <form onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');try { const r=await api(base.endsWith('/account')?base:`${base}/settings`,{method:'PUT',body:JSON.stringify({username:name,version:user.version})});onSaved(r.user);notify.success(r.message); }catch(e:any){setMessage(e.message); notify.error(e.message);}finally{setBusy(false);}}}>
      <fieldset disabled={busy || Boolean(user.deleted_at)} className="account-fields">
        <div className="account-avatar-row">{user.avatar_url ? <img className="account-avatar" src={safeImageSrc(user.avatar_url)} alt={t("m_fb06241b72")}/> : <span className="account-avatar account-avatar-empty">{user.username.slice(0,1)}</span>}
          <div className="account-upload"><label className="account-upload-trigger"><span>{t("m_d7d2344d54")}</span><FormInput aria-label={t("m_d7d2344d54")} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label><small>{t("m_340d830116")}</small></div>
        </div>
        <label>{t("m_1a3f0617d6")}<FormInput value={name} maxLength={40} onChange={e=>setName(e.target.value)} required autoComplete="username"/></label>
        <button type="submit" className="neo-button neo-button-dark">{busy?t("m_ff509c9ba0"):t("m_c0a70fcb56")}</button>
      </fieldset>
      {busy && uploadController.current && <button type="button" className="text-link" onClick={()=>uploadController.current?.abort()}>{t("m_a248363330")}</button>}
      {message && <p className="account-message" role="status">{t(message || '')}</p>}
    </form>
  </section>;
}
