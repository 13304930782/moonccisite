import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPagination } from '../components/AdminPagination';
import { ThemeSelect } from '../components/ThemeSelect';
import { api } from '../lib/api';

export default function AdminPostsPage() {
  const [drafts,setDrafts]=useState<any[]>([]);
  const [draftPage,setDraftPage]=useState(1),[draftTotal,setDraftTotal]=useState(0);
  const [filter,setFilter]=useState('all');
  const [posts, setPosts] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);
  const loadPosts = async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const [data, working] = await Promise.all([api(`/admin/posts?page=${page}&pageSize=50&status=${filter}`),api(`/article-drafts?page=${draftPage}`)]);
      setDraftTotal(working.total||0);setDrafts(prev=>draftPage===1?(working.items||[]):[...new Map([...prev,...(working.items||[])].map(d=>[d.id,d])).values()]);
      if (version !== requestVersion.current) return;
      setPosts(data.items); setTotal(data.total);
      if (data.page !== page) setPage(data.page);
    } catch (err: any) { if (version === requestVersion.current) setMessage(err.message || '文章加载失败'); }
    finally { if (version === requestVersion.current) setLoading(false); }
  };
  useEffect(() => {
    setPosts([]); setMessage(''); void loadPosts();
    return () => { requestVersion.current++; };
  }, [page,filter,draftPage]);

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
    <div className="admin-page">
      <div className="admin-page-body">
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

        <ThemeSelect aria-label="筛选文章状态" value={filter} onValueChange={v=>{setFilter(v);setPage(1);}}><option value="all">全部</option><option value="published">已发布</option><option value="draft">草稿</option></ThemeSelect>
        {filter!=='published' && drafts.filter(d=>!d.post_id).map(d=><div className="admin-list-row" key={d.id}><h2>{d.payload.title||'未命名草稿'}</h2><p>草稿 · {new Date(d.updated_at).toLocaleString()}</p><Link to={`/admin/write?draft=${d.id}`}>继续编辑 / 预览</Link><button onClick={async()=>{if(confirm('删除这份未发布草稿？')){try{await api(`/article-drafts/${d.id}`,{method:'DELETE',body:JSON.stringify({version:d.version})});setDrafts(prev=>prev.filter(item=>item.id!==d.id));void loadPosts();}catch(e:any){setMessage(e.message);}}}}>删除草稿</button></div>)}
        {draftPage*20<draftTotal&&<button onClick={()=>setDraftPage(n=>n+1)}>加载更多草稿</button>}
        <AdminPagination label="文章管理分页" page={page} total={total} disabled={loading} onPage={setPage} />
        {loading && <p role="status">正在加载文章…</p>}
        <div className="space-y-4">
          {!loading && !message && posts.length === 0 && <p className="text-muted-foreground">还没有文章，先点击右上角写文章。</p>}

          {posts.map((post) => (
            <div key={post.id} className="admin-list-row">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-medium text-foreground">{post.title}{(Boolean(post.has_unpublished)||drafts.some(d=>d.post_id===post.id))&&<small> · 有未发布修改</small>}</h2>
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
