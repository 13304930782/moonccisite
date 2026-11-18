import { useI18n } from '../i18n';
import { notify } from '../lib/feedback';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from '../components/LocaleLink';
import { AdminButton } from '../components/admin/AdminButton';
import { AdminNotice } from '../components/admin/AdminState';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useUnsavedLeave } from '../lib/useUnsavedLeave';
import '../../styles/admin-ui-v2.css';
import '../../styles/editor-applications.css';

function canWrite(role?: string) { return role==='owner' || role==='admin' || role==='editor'; }
function getRoleTip(role?: string) {
  if(role==='owner')return '你当前是站长账号，已经拥有最高权限，不需要申请成为编辑。';
  if(role==='admin')return '你当前是管理员账号，已经可以写文章和管理内容，不需要申请成为编辑。';
  if(role==='editor')return '你当前已经是编辑账号，可以直接写文章。';
  return '投稿不需要编辑权限；如需参与后台内容维护，再提交编辑申请。';
}
const roleNames:Record<string,string>={owner:'站长',admin:'管理员',editor:'编辑',teacher:'教师',user:'普通用户'};
export default function EditorApplyPage() {
  const {t}=useI18n();
  const {user}=useAuth();
  const [reason,setReason]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(false);
  const pending=useRef(false);
  useUnsavedLeave(!canWrite(user?.role) && !!reason.trim());
  useEffect(() => {setMessage('');},[user?.role]);
  const submit=async(event:FormEvent) => {
    event.preventDefault();
    if(pending.current)return;
    if(!user){setMessage(t('m_b54de79265'));return;}
    if(canWrite(user.role)){setMessage(t('m_f9a5222d13'));return;}
    if(!reason.trim()){setMessage(t('m_a3623909ea'));return;}
    pending.current=true;setLoading(true);setMessage('');
    try {const res=await api('/applications',{method:'POST',body:JSON.stringify({reason})});notify.success(res.message||t('m_5a4423372d'));setReason('');}
    catch(err:any){setMessage(err.message||t('m_2084657131'));}
    finally {pending.current=false;setLoading(false);}
  };
  return <section className="admin-page editor-apply-page ui-v2">
    <header className="editor-applications-heading"><div><h1 className="admin-title">{t('m_6ef4c0ce0a')}</h1><p>{t(getRoleTip(user?.role))}</p></div></header>
    <div className="editor-apply-account"><strong>{user?.username}</strong><span>{t(roleNames[user?.role||'user']||'普通用户')}</span></div>
    {!canWrite(user?.role) && <form onSubmit={submit} className="editor-apply-form" aria-busy={loading}>
      <div className="editor-apply-form-heading"><label htmlFor="editor-reason">{t('m_c033e6eeed')}</label><AdminButton asChild variant="ghost"><Link to="/account/submissions">{t('m_77de6910c7')}</Link></AdminButton></div>
      <textarea id="editor-reason" disabled={loading} value={reason} onChange={event => setReason(event.target.value)} rows={6} placeholder={t('m_6c840684a2')} required/>
      {message && <AdminNotice>{t(message)}</AdminNotice>}
      <div className="editor-apply-actions"><AdminButton type="submit" disabled={loading||!user||!reason.trim()}>{loading?t('m_18931020ad'):t('m_9cc5e4d81e')}</AdminButton></div>
    </form>}
    {canWrite(user?.role) && message && <AdminNotice>{t(message)}</AdminNotice>}
  </section>;
}
