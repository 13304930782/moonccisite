import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { AccountProfileForm, AccountProfile } from '../components/AccountProfileForm';
import '../../styles/account.css';
export default function AdminUserSettingsPage() {
  const { id } = useParams(); const navigate=useNavigate();
  const base=`/admin/users/${id}`;
  const [user,setUser]=useState<AccountProfile|null>(null),[email,setEmail]=useState(''),[confirmation,setConfirmation]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const load=()=>api(`${base}/settings`).then(r=>{setUser(r.user);setEmail(r.user.email);setError('');}).catch(e=>setError(e.message));
  useEffect(()=>{void load();},[id]);
  const run=async(path:string,method:string,body?:object)=>{
    setBusy(true);setMessage('');
    try{const r=await api(path,{method,...(body?{body:JSON.stringify(body)}:{})});setMessage(r.message);if(r.user)setUser(r.user);else await load();return true;}
    catch(e:any){setMessage(e.message);return false;}finally{setBusy(false);}
  };
  return <div className="admin-page"><Link className="text-link" to="/admin/users">返回用户管理</Link><h1 className="admin-title">用户设置</h1>
    {error?<p role="alert">{error}<button onClick={load}>重试</button></p>:!user?<p role="status">正在加载…</p>:<>
      <p>#{user.id} · {user.username}{user.deleted_at&&<small className="deleted-account-label">已删除</small>}</p>
      <AccountProfileForm key={user.id} user={user} base={base} onSaved={setUser}/>
      {!user.deleted_at&&<fieldset disabled={busy}>
        <section className="account-section"><div><h2>登录邮箱</h2><p>管理员设置邮箱会使该用户的旧登录会话失效。</p></div><form className="account-fields" onSubmit={e=>{e.preventDefault();void run(`${base}/email`,'PUT',{email,version:user.version});}}><label>登录邮箱<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><button className="neo-button" type="submit">保存登录邮箱</button></form></section>
        <section className="account-section"><div><h2>权限与状态</h2><p>停用可以恢复；删除不能恢复。</p></div><form className="account-fields" onSubmit={e=>{e.preventDefault();void run(base,'PUT',{role:user.role,status:user.status,can_comment:user.can_comment});}}>
          <label>角色<select value={user.role} onChange={e=>setUser({...user,role:e.target.value})}><option value="user">普通用户</option><option value="editor">编辑</option><option value="teacher">教师</option><option value="admin">管理员</option><option value="owner">站长</option></select></label>
          <label>状态<select value={user.status} onChange={e=>setUser({...user,status:e.target.value})}><option value="active">正常</option><option value="disabled">已停用</option></select></label>
          <label>评论权限<select value={user.can_comment} onChange={e=>setUser({...user,can_comment:Number(e.target.value)})}><option value={1}>允许评论</option><option value={0}>禁止评论</option></select></label><button className="neo-button" type="submit">保存权限</button>
        </form></section>
        <section className="account-section"><div><h2>密码</h2><p>重置链接发给用户，管理员不会获得密码。</p></div><button className="neo-button" onClick={()=>void run(`${base}/password-reset`,'POST')}>发送密码重置链接</button></section>
        <section className="account-section"><div><h2>删除账号</h2><p>保留文章、评论、用户名和头像并标记“已删除”。释放邮箱和第三方绑定，账号无法恢复。</p></div><form className="account-fields" onSubmit={async e=>{e.preventDefault();if(await run(`${base}/account`,'DELETE',{username:confirmation}))navigate('/admin/users');}}><label>输入“{user.username}”确认删除<input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label><button className="neo-button account-danger" disabled={confirmation!==user.username}>删除账号</button></form></section>
      </fieldset>}
      {message&&<p role="status" className="account-message">{message}</p>}
    </>}
  </div>;
}
