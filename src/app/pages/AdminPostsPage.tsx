import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function AdminPostsPage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  const loadPosts = () => {
    api('/admin/posts')
      .then(setPosts)
      .catch((err) => setMessage(err.message || '文章加载失败'));
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const removePost = async (id: number) => {
    if (!window.confirm('确定要删除这篇文章吗？')) return;

    try {
      await api(`/posts/${id}`, { method: 'DELETE' });
      setMessage('删除成功');
      loadPosts();
    } catch (err: any) {
      setMessage(err.message || '删除失败');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 px-6 py-16">
      <div className="max-w-5xl mx-auto rounded-3xl bg-white/80 backdrop-blur border border-white/40 p-8 shadow-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <Link to="/admin" className="text-sm text-blue-600 hover:underline">返回后台</Link>
            <h1 className="text-3xl font-bold mt-2 text-gray-900">文章管理</h1>
          </div>

          <Link to="/admin/write" className="rounded-full bg-blue-600 px-5 py-2 text-white hover:bg-blue-700">
            写文章
          </Link>
        </div>

        {message && <div className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-blue-700">{message}</div>}

        <div className="space-y-4">
          {posts.length === 0 && <p className="text-gray-500">还没有文章，先点击右上角写文章。</p>}

          {posts.map((post) => (
            <div key={post.id} className="rounded-2xl border border-gray-200 bg-white/70 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{post.title}</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    作者：{post.author_name || '-'} ｜ 状态：{post.status === 'published' ? '已发布' : '草稿'} ｜ 分类：{post.category || '-'}
                  </p>
                  <p className="mt-2 text-gray-600 line-clamp-2">{post.summary}</p>
                </div>

                <div className="flex gap-3 shrink-0">
                  <Link to={`/admin/posts/${post.id}/edit`} className="rounded-full border px-4 py-2 text-sm hover:bg-gray-50">
                    编辑
                  </Link>
                  <button onClick={() => removePost(post.id)} className="rounded-full border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
