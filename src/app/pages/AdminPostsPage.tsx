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
    <div className="min-h-full bg-transparent px-6 py-10">
      <div className="max-w-5xl mx-auto rounded-[10px] bg-card  border border-border p-8 shadow-none">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <Link to="/admin" className="text-sm text-foreground hover:underline">返回后台</Link>
            <h1 className="admin-title">文章管理</h1>
          </div>

          <Link to="/admin/write" className="rounded-full bg-muted px-5 py-2 text-foreground hover:bg-muted">
            写文章
          </Link>
        </div>

        {message && <div className="mb-4 rounded-[6px] bg-muted px-4 py-3 text-foreground">{message}</div>}

        <div className="space-y-4">
          {posts.length === 0 && <p className="text-muted-foreground">还没有文章，先点击右上角写文章。</p>}

          {posts.map((post) => (
            <div key={post.id} className="rounded-[10px] border border-border bg-card p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-medium text-foreground">{post.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    作者：{post.author_name || '-'} ｜ 状态：{post.status === 'published' ? '已发布' : '草稿'} ｜ 分类：{post.category || '-'}
                  </p>
                  <p className="mt-2 text-muted-foreground line-clamp-2">{post.summary}</p>
                </div>

                <div className="flex gap-3 shrink-0">
                  <Link to={`/admin/posts/${post.id}/edit`} className="rounded-full border px-4 py-2 text-sm hover:bg-muted">
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
