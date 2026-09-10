import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminList } from '../lib/useAdminList';
import { AdminPagination } from '../components/AdminPagination';
import { ThemeSelect } from '../components/ThemeSelect';
const roles: Record<string,string> = {owner:'站长',admin:'管理员',editor:'编辑',teacher:'教师',user:'普通用户'};
export default function AdminUsersPage() {
  const [keyword,setKeyword] = useState('');
  const [filters,setFilters] = useState({keyword:'',role:'all',status:'all'});
  const list = useAdminList<any>('/admin/users',filters);
  const filter = (patch: Partial<typeof filters>) => { list.setPage(1); setFilters(f=>({...f,...patch})); };
  return <div className="admin-page">
    <h1 className="admin-title">用户管理</h1>
    <p className="text-muted-foreground">查看账号资料、登录方式与权限。进入设置可修改资料或删除账号。</p>
    <div className="admin-toolbar">
      <form className="admin-search" onSubmit={e=>{e.preventDefault();filter({keyword:keyword.trim()});}}>
        <input aria-label="搜索用户" placeholder="搜索用户名或邮箱" value={keyword} onChange={e=>setKeyword(e.target.value)} />
        <button className="neo-button" type="submit">搜索</button>
      </form>
      <ThemeSelect aria-label="筛选角色" value={filters.role} onValueChange={role=>filter({role})}>
        <option value="all">全部角色</option>{Object.entries(roles).map(([v,n])=><option key={v} value={v}>{n}</option>)}
      </ThemeSelect>
      <ThemeSelect aria-label="筛选用户状态" value={filters.status} onValueChange={status=>filter({status})}>
        <option value="all">全部状态</option><option value="active">正常</option><option value="disabled">停用 / 已删除</option>
      </ThemeSelect>
    </div>
    <AdminPagination label="用户管理分页" page={list.page} total={list.total} disabled={list.loading} onPage={list.setPage}/>
    {list.error && <p role="alert">{list.error}<button className="text-link" onClick={list.reload}>重试</button></p>}
    {list.loading && <p role="status">正在加载用户…</p>}
    <div>{list.items.map(user=><article className="admin-user-row" key={user.id}>
      <div className="admin-user-info"><strong>{user.username}</strong>{user.deleted_at && <small className="deleted-account-label">已删除</small>}
        <p>{user.deleted_at ? '邮箱与第三方绑定已释放' : user.email}</p>
        <p>#{user.id} · {roles[user.role] || user.role} · {user.deleted_at ? '已删除' : user.status==='active'?'正常':'已停用'} · 评论{user.can_comment?'允许':'禁止'}</p>
      </div>
      <Link className="neo-button" to={`/admin/users/${user.id}/settings`}>{user.deleted_at?'查看':'设置'}</Link>
    </article>)}</div>
    {!list.loading && !list.error && !list.items.length && <p>没有符合条件的用户。</p>}
  </div>;
}
