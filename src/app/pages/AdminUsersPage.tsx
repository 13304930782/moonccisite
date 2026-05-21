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
      await api(`/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          role: patch.role ?? user.role,
          status: patch.status ?? user.status,
          can_comment: patch.can_comment ?? user.can_comment,
        }),
      });

      setMessage('更新成功');
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 px-6 py-16">
      <div className="max-w-6xl mx-auto rounded-3xl bg-white/80 backdrop-blur border border-white/40 p-8 shadow-xl">
        <Link to="/admin" className="text-sm text-blue-600 hover:underline">返回后台</Link>
        <h1 className="mt-2 mb-8 text-3xl font-bold text-gray-900">用户管理</h1>

        {message && <div className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-blue-700">{message}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-gray-500">
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
                <tr key={user.id} className="border-b border-gray-100">
                  <td className="py-3 pr-4">{user.id}</td>
                  <td className="py-3 pr-4">{user.username}</td>
                  <td className="py-3 pr-4">{user.email}</td>

                  <td className="py-3 pr-4">
                    <select value={user.role} onChange={(e) => updateUser(user, { role: e.target.value })} className="rounded-lg border px-2 py-1 bg-white">
                      <option value="owner">站长</option>
                      <option value="admin">管理员</option>
                      <option value="editor">编辑</option>
                      <option value="user">普通用户</option>
                    </select>
                  </td>

                  <td className="py-3 pr-4">
                    <select value={user.status} onChange={(e) => updateUser(user, { status: e.target.value })} className="rounded-lg border px-2 py-1 bg-white">
                      <option value="active">active</option>
                      <option value="disabled">disabled</option>
                    </select>
                  </td>

                  <td className="py-3 pr-4">
                    <select value={String(user.can_comment ?? 1)} onChange={(e) => updateUser(user, { can_comment: Number(e.target.value) })} className="rounded-lg border px-2 py-1 bg-white">
                      <option value="1">允许</option>
                      <option value="0">禁止</option>
                    </select>
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

          {users.length === 0 && <p className="mt-4 text-gray-500">暂无用户。</p>}
        </div>
      </div>
    </div>
  );
}
