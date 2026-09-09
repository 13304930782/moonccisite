import { useAdminList } from '../lib/useAdminList';
import { AdminPagination } from '../components/AdminPagination';
import { ThemeSelect } from '../components/ThemeSelect';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function AdminUsersPage() {
  const [message, setMessage] = useState('');
  const [keyword, setKeyword] = useState('');
  const [filters, setFilters] = useState({ keyword: '', role: 'all', status: 'all' });
  const [busy, setBusy] = useState(false);
  const list = useAdminList<any>('/admin/users', filters);
  const users = list.items;
  const loadUsers = list.reload;
  const filter = (patch: Partial<typeof filters>) => { list.setPage(1); setFilters(f => ({ ...f, ...patch })); list.reload(); setMessage(''); };

  const updateUser = async (user: any, patch: any) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api(`/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });

      setMessage(result.message || '更新成功');
      loadUsers();
    } catch (err: any) {
      setMessage(err.message || '更新失败');
    } finally { setBusy(false); }
  };

  const removeUser = async (id: number) => {
    if (!window.confirm('确定停用这个用户并禁止其评论吗？已有文章和评论会保留。')) return;

    if (busy) return;
    setBusy(true);
    try {
      await api(`/admin/users/${id}`, { method: 'DELETE' });
      setMessage('用户已停用，文章和评论已保留');
      loadUsers();
    } catch (err: any) {
      setMessage(err.message || '停用失败');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-full bg-transparent px-6 py-10">
      <div className="max-w-6xl mx-auto rounded-[10px] bg-card  border border-border p-8 shadow-none">
        <Link to="/admin" className="text-sm text-foreground hover:underline">返回后台</Link>
        <h1 className="admin-title">用户管理</h1>

        {message && <div className="mb-4 rounded-[6px] bg-muted px-4 py-3 text-foreground">{message}</div>}

        <fieldset disabled={busy} className="mb-4 flex flex-wrap gap-3">
          <input aria-label="搜索用户" placeholder="搜索用户名或邮箱" value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') filter({ keyword: keyword.trim() }); }} className="rounded border bg-card px-3 py-2" />
          <button onClick={() => filter({ keyword: keyword.trim() })} className="rounded border px-4 py-2">搜索</button>
          <ThemeSelect aria-label="筛选角色" value={filters.role} onValueChange={role => filter({ role })}>
            <option value="all">全部角色</option><option value="owner">站长</option><option value="admin">管理员</option><option value="editor">编辑</option><option value="teacher">教师</option><option value="user">普通用户</option>
          </ThemeSelect>
          <ThemeSelect aria-label="筛选用户状态" value={filters.status} onValueChange={status => filter({ status })}>
            <option value="all">全部状态</option><option value="active">正常</option><option value="disabled">已停用</option>
          </ThemeSelect>
        </fieldset>
        <AdminPagination label="用户管理分页" page={list.page} total={list.total} disabled={list.loading || busy} onPage={list.setPage} />
        {list.error && <p role="alert">{list.error}</p>}
        {list.loading && <p role="status">正在加载用户…</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-3 pr-4">ID</th>
                <th className="py-3 pr-4">用户名</th>
                <th className="py-3 pr-4">邮箱</th>
                <th className="py-3 pr-4">角色</th>
                <th className="py-3 pr-4">状态</th>
                <th className="py-3 pr-4">评论权限</th>
                <th className="py-3 pr-4">操作</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border">
                  <td className="py-3 pr-4">{user.id}</td>
                  <td className="py-3 pr-4">{user.username}</td>
                  <td className="py-3 pr-4">{user.email}</td>

                  <td className="py-3 pr-4">
                    <ThemeSelect disabled={busy} aria-label={`${user.username}的角色`} value={user.role} onValueChange={(nextValue) => updateUser(user, { role: nextValue })} className="rounded-lg border px-2 py-1 bg-card">
                      <option value="owner">站长</option>
                      <option value="admin">管理员</option>
                      <option value="editor">编辑</option>
                      <option value="user">普通用户</option>
                    </ThemeSelect>
                  </td>

                  <td className="py-3 pr-4">
                    <ThemeSelect disabled={busy} aria-label={`${user.username}的状态`} value={user.status} onValueChange={(nextValue) => updateUser(user, { status: nextValue })} className="rounded-lg border px-2 py-1 bg-card">
                      <option value="active">active</option>
                      <option value="disabled">disabled</option>
                    </ThemeSelect>
                  </td>

                  <td className="py-3 pr-4">
                    <ThemeSelect disabled={busy} aria-label={`${user.username}的评论权限`} value={String(user.can_comment ?? 1)} onValueChange={(nextValue) => updateUser(user, { can_comment: Number(nextValue) })} className="rounded-lg border px-2 py-1 bg-card">
                      <option value="1">允许</option>
                      <option value="0">禁止</option>
                    </ThemeSelect>
                  </td>

                  <td className="py-3 pr-4">
                    <button disabled={busy || user.status === 'disabled'} onClick={() => removeUser(user.id)} className="text-red-600 hover:underline">
                      停用
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!list.loading && !list.error && users.length === 0 && <p className="mt-4 text-muted-foreground">暂无用户。</p>}
        </div>
      </div>
    </div>
  );
}
