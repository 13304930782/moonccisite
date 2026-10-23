import { articlePath } from '../lib/articleUrl';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { notify } from '../lib/feedback';
import { confirmAction } from '../lib/confirmAction';
import { ArticleImport } from '../components/ArticleImport';
import { AdminButton } from '../components/admin/AdminButton';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { Skeleton } from '../components/ui/skeleton';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import '../../styles/admin-ui-v2.css';
import '../../styles/admin-posts.css';

type Post = { id: number; title: string; summary: string; category: string; author_name: string; status: string; has_unpublished: number | boolean };
type Draft = { id: string; post_id: number | null; version: number; updated_at: string; payload: { title?: string } };
type Filter = 'all' | 'published' | 'draft';
const filters: { value: Filter; label: string }[] = [{ value: 'all', label: '全部' }, { value: 'published', label: '已发布' }, { value: 'draft', label: '草稿' }];

export default function AdminPostsPage() {
  const { user } = useAuth();
  const manager = ['owner', 'admin'].includes(user?.role || '');
  // The dialog may unmount, but the original import keeps its pending/result state.
  const [importHost] = useState(() => typeof document === 'undefined' ? null : document.createElement('div'));
  useEffect(() => { const details = importHost?.querySelector('details'); if (details) details.open = true; }, [importHost, manager]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftPage, setDraftPage] = useState(1), [draftTotal, setDraftTotal] = useState(0);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [posts, setPosts] = useState<Post[]>([]);
  const [allPosts, setAllPosts] = useState<Post[] | null>(null);
  const [allTotal, setAllTotal] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(1), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    const version = ++requestVersion.current;
    setLoading(true); setPosts([]); setMessage('');
    async function load() {
      try {
        const [data, working] = await Promise.all([
          api(`/admin/posts?page=${page}&pageSize=50&status=${filter}`),
          api(`/article-drafts?page=${draftPage}`),
        ]);
        // Neither collection may be updated by a response from an earlier view.
        if (version !== requestVersion.current) return;
        const items: Post[] = data.items || [];
        setPosts(items); setTotal(data.total);
        setDraftTotal(working.total || 0); setDraftsLoaded(true);
        setDrafts(previous => [...new Map((draftPage === 1 ? working.items || [] : [...previous, ...(working.items || [])]).map((draft: Draft) => [draft.id, draft])).values()] as Draft[]);
        if (filter === 'all') {
          setAllTotal(data.total);
          setAllPosts(data.page === 1 && items.length === data.total ? items : null);
        }
        if (data.page !== page) setPage(data.page);
      } catch (error: any) {
        if (version === requestVersion.current) setMessage(error.message || '文章加载失败');
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    }
    void load();
    return () => { requestVersion.current++; };
  }, [page, filter, draftPage, refresh]);

  const independentDrafts = drafts.filter(draft => !draft.post_id);
  const allDraftsLoaded = draftsLoaded && drafts.length === draftTotal;
  const counts = allPosts && allDraftsLoaded ? {
    all: allPosts.length + independentDrafts.length,
    published: allPosts.filter(post => post.status === 'published').length,
    draft: allPosts.filter(post => post.status === 'draft').length + independentDrafts.length,
  } : null;
  const knownTotal = allTotal !== null && allDraftsLoaded ? allTotal + independentDrafts.length : null;
  const shownDrafts = filter === 'published' ? [] : independentDrafts;
  const shown = posts.length + shownDrafts.length;
  const pages = Math.max(1, Math.ceil(total / 50));

  async function removePost(id: number) {
    if (!(await confirmAction('确定要删除这篇文章吗？'))) return;
    setRemoving(`post-${id}`);
    try {
      await api(`/posts/${id}`, { method: 'DELETE' });
      requestVersion.current++; setDraftsLoaded(false);
      notify.success('删除成功');
      setAllPosts(null); setAllTotal(previous => previous === null ? null : Math.max(0, previous - 1));
      setRefresh(value => value + 1);
    } catch (error: any) {
      setMessage(error.message || '删除失败'); notify.error(error.message || '删除失败');
    } finally { setRemoving(null); }
  }

  async function removeDraft(draft: Draft) {
    if (!(await confirmAction('删除这份未发布草稿？'))) return;
    setRemoving(`draft-${draft.id}`);
    try {
      await api(`/article-drafts/${draft.id}`, { method: 'DELETE', body: JSON.stringify({ version: draft.version }) });
      requestVersion.current++;
      setDrafts(previous => previous.filter(item => item.id !== draft.id));
      setDraftsLoaded(false); setDraftPage(1); setRefresh(value => value + 1);
    } catch (error: any) { setMessage(error.message); notify.error(error.message); }
    finally { setRemoving(null); }
  }

  function rowActions(edit: string, title: string, key: string, remove: () => void, draft = false, view?: string) {
    return <div className="admin-posts-actions">
      <AdminButton asChild variant="ghost" className="ui-btn ui-btn--ghost"><Link to={edit}>编辑</Link></AdminButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><AdminButton variant="ghost" size="icon" aria-label={`更多操作：${title}`} className="ui-btn ui-btn--ghost ui-btn--icon"><MoreHorizontal aria-hidden="true" size={18} /></AdminButton></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="admin-portal ui-v2 admin-posts-menu">
          <DropdownMenuItem asChild><Link to={edit}>{draft ? '继续编辑 / 预览' : '编辑'}</Link></DropdownMenuItem>
          {view && <DropdownMenuItem asChild><Link to={view}>查看</Link></DropdownMenuItem>}
          <DropdownMenuItem variant="destructive" disabled={removing === key} onSelect={remove}>{draft ? '删除草稿' : '删除'}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>;
  }

  return <div className="admin-page admin-posts-page ui-v2">
    <div className="admin-page-body">
      <header className="admin-posts-header">
        <div><Link to="/admin" className="admin-posts-back">返回后台</Link><div className="admin-posts-heading"><h1>文章管理</h1>{knownTotal !== null && <span>共 {knownTotal} 篇</span>}</div></div>
        <div className="admin-posts-header-actions">
          {manager && <Dialog>
            <DialogTrigger asChild><AdminButton variant="soft" className="ui-btn ui-btn--soft">从旧站导入</AdminButton></DialogTrigger>
            <DialogContent className="admin-portal ui-v2 admin-posts-import-dialog" aria-describedby={undefined}>
              <DialogTitle>从旧站导入</DialogTitle>
              <div ref={element => { if (element && importHost && !element.contains(importHost)) element.appendChild(importHost); }} />
            </DialogContent>
          </Dialog>}
          <AdminButton asChild variant="solid" className="ui-btn ui-btn--solid"><Link to="/admin/write">写文章</Link></AdminButton>
        </div>
      </header>
      {manager && importHost && createPortal(<ArticleImport />, importHost)}
      <div className="admin-posts-filters" role="group" aria-label="筛选文章状态">
        {filters.map(item => <AdminButton key={item.value} variant="ghost" aria-pressed={filter === item.value} onClick={() => { setFilter(item.value); setPage(1); }} className="ui-btn ui-btn--ghost">{item.label}{counts && <span className="admin-posts-filter-count">{counts[item.value]}</span>}</AdminButton>)}
      </div>
      {message && <div className="admin-posts-message" role="alert">{message}</div>}
      {loading ? <div className="admin-posts-skeleton" role="status" aria-label="正在加载文章…">
        {[0, 1, 2].map(index => <div className="admin-posts-skeleton-row" key={index}><Skeleton className="admin-posts-skeleton-title" /><Skeleton className="admin-posts-skeleton-meta" /><Skeleton className="admin-posts-skeleton-summary" /></div>)}
      </div> : <div className="admin-posts-list">
        {shownDrafts.map(draft => {
          const title = draft.payload.title || '未命名草稿', edit = `/admin/write?draft=${draft.id}`;
          return <article className="admin-posts-row" key={`draft-${draft.id}`}>
            <Link to={edit} className="admin-posts-main"><h2>{title}</h2><p className="admin-posts-meta">草稿 · {new Date(draft.updated_at).toLocaleString()}</p></Link>
            <div className="admin-posts-row-end"><span className="admin-posts-status"><span aria-hidden="true" className="admin-posts-status-dot" />草稿</span>{rowActions(edit, title, `draft-${draft.id}`, () => void removeDraft(draft), true)}</div>
          </article>;
        })}
        {posts.map(post => {
          const edit = `/admin/posts/${post.id}/edit`;
          return <article className="admin-posts-row" key={`post-${post.id}`}>
            <Link to={edit} className="admin-posts-main"><h2>{post.title}</h2><p className="admin-posts-meta">分类：{post.category || '-'} · 作者：{post.author_name || '-'}</p>{post.summary && <p className="admin-posts-summary">{post.summary}</p>}</Link>
            <div className="admin-posts-row-end">
              {Boolean(Number(post.has_unpublished)) && <span className="admin-posts-unpublished">有未发布修改</span>}
              <span className="admin-posts-status" data-status={post.status}><span aria-hidden="true" className="admin-posts-status-dot" />{post.status === 'published' ? '已发布' : '草稿'}</span>
              {rowActions(edit, post.title, `post-${post.id}`, () => void removePost(post.id), false, post.status === 'published' ? articlePath(post) : undefined)}
            </div>
          </article>;
        })}
        {!message && shown === 0 && <div className="admin-posts-empty"><p>还没有文章，先点击右上角写文章。</p><AdminButton asChild variant="solid" className="ui-btn ui-btn--solid"><Link to="/admin/write">写文章</Link></AdminButton></div>}
      </div>}
      {filter !== 'published' && draftPage * 20 < draftTotal && <div className="admin-posts-more"><AdminButton variant="ghost" disabled={loading} onClick={() => setDraftPage(value => value + 1)} className="ui-btn ui-btn--ghost">加载更多草稿</AdminButton></div>}
      {pages > 1 ? <nav className="admin-posts-pagination" aria-label="文章管理分页">
        <AdminButton variant="ghost" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)} className="ui-btn ui-btn--ghost">上一页</AdminButton>
        <span>共 {total} 条，第 {page} / {pages} 页</span>
        <AdminButton variant="ghost" disabled={loading || page >= pages} onClick={() => setPage(value => value + 1)} className="ui-btn ui-btn--ghost">下一页</AdminButton>
      </nav> : !loading && <p className="admin-posts-shown">已显示 {shown} 篇</p>}
    </div>
  </div>;
}
