import { useState } from 'react';
import { api } from '../lib/api';
import { safeImageSrc } from '../lib/safeUrl';
export type AccountProfile = { id: number; username: string; email: string; avatar_url?: string; deleted_at?: string; role: string; status: string; can_comment: number; version: number };
export function AccountProfileForm({ user, base, onSaved }: { user: AccountProfile; base: string; onSaved: (user: AccountProfile) => void }) {
  const [name, setName] = useState(user.username), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true); setMessage('');
    try { const data = new FormData(); data.append('avatar', file); const result = await api(`${base}/avatar`, {method:'POST',body:data}); onSaved(result.user); setMessage(result.message); }
    catch(e:any) { setMessage(e.message); } finally { setBusy(false); }
  };
  return <section className="account-section">
    <div><h2>个人资料</h2><p>头像和用户名会显示在文章与评论旁。</p></div>
    <form onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');try { const r=await api(base.endsWith('/account')?base:`${base}/settings`,{method:'PUT',body:JSON.stringify({username:name,version:user.version})});onSaved(r.user);setMessage(r.message); }catch(e:any){setMessage(e.message);}finally{setBusy(false);}}}>
      <fieldset disabled={busy || Boolean(user.deleted_at)} className="account-fields">
        <div className="account-avatar-row">{user.avatar_url ? <img className="account-avatar" src={safeImageSrc(user.avatar_url)} alt="当前头像"/> : <span className="account-avatar account-avatar-empty">{user.username.slice(0,1)}</span>}
          <label className="account-upload">上传头像<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/><small>JPG、PNG、WebP，最大 2 MB</small></label>
        </div>
        <label>用户名<input value={name} maxLength={40} onChange={e=>setName(e.target.value)} required autoComplete="username"/></label>
        <button type="submit" className="neo-button neo-button-dark">{busy?'保存中…':'保存资料'}</button>
      </fieldset>
      {message && <p className="account-message" role="status">{message}</p>}
    </form>
  </section>;
}
