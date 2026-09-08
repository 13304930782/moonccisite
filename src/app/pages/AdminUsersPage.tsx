import { ThemeSelect } from '../components/ThemeSelect';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  const loadUsers = () => {
    api('/admin/users')
      .then(setUsers)
      .catch((err) => setMessage(err.message || '用户加载失败，请确认当前账号是管理员'));
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const updateUser = async (user: any, patch: any) => {
    try {
      const result = await api(`/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });

      setMessage(result.message || '更新成功');
      loadUsers();
    } catch (err: any) {
      setMessage(err.message || '更新失败');
    }
  };

  const removeUser = async (id: number) => {
    if (!window.confirm('确定要删除这个用户吗？该用户文章和评论也会被删除。')) return;

    try {
      await api(`/admin/users/${id}`, { method: 'DELETE' });
      setMessage('删除成功');
      loadUsers();
    } catch (err: any) {
      setMessage(err.message || '删除失败');
    }
  };

  return (
    <div className="min-h-full bg-transparent px-6 py-10">
      <div className="max-w-6xl mx-auto rounded-[10px] bg-card  border border-border p-8 shadow-none">
        <Link to="/admin" className="text-sm text-foreground hover:underline">返回后台</Link>
        <h1 className="admin-title">用户管理</h1>

        {message && <div className="mb-4 rounded-[6px] bg-muted px-4 py-3 text-foreground">{message}</div>}

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
                    <ThemeSelect value={user.role} onValueChange={(nextValue) => updateUser(user, { role: nextValue })} className="rounded-lg border px-2 py-1 bg-card">
                      <option value="owner">站长</option>
                      <option value="admin">管理员</option>
                      <option value="editor">编辑</option>
                      <option value="user">普通用户</option>
                    </ThemeSelect>
                  </td>

                  <td className="py-3 pr-4">
                    <ThemeSelect value={user.status} onValueChange={(nextValue) => updateUser(user, { status: nextValue })} className="rounded-lg border px-2 py-1 bg-card">
                      <option value="active">active</option>
                      <option value="disabled">disabled</option>
                    </ThemeSelect>
                  </td>

                  <td className="py-3 pr-4">
                    <ThemeSelect value={String(user.can_comment ?? 1)} onValueChange={(nextValue) => updateUser(user, { can_comment: Number(nextValue) })} className="rounded-lg border px-2 py-1 bg-card">
                      <option value="1">允许</option>
                      <option value="0">禁止</option>
                    </ThemeSelect>
                  </td>

                  <td className="py-3 pr-4">
                    <button onClick={() => removeUser(user.id)} className="text-red-600 hover:underline">
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && <p className="mt-4 text-muted-foreground">暂无用户。</p>}
        </div>
      </div>
    </div>
  );
}
