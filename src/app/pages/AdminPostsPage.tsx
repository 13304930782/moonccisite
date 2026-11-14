import { useI18n } from '../i18n';
import { useContentListQuery } from '../lib/useContentListQuery';
import { articlePath } from '../lib/articleUrl';
import { useEffect, useRef, useState } from 'react';

import {Link} from '../components/LocaleLink';
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

type Post = { id: number; title: string; summary: string; category: string; author_name: string; status: string; has_unpublished: number | boolean; has_unpublished_zh?: number | boolean; has_unpublished_en?: number | boolean };
type Draft = { id: string; post_id: number | null; version: number; updated_at: string; payload: { title?: string } };
type Filter = 'all' | 'published' | 'draft';
const filters: { value: Filter; label: string }[] = [{ value: 'all', label: '全部' }, { value: 'published', label: '已发布' }, { value: 'draft', label: '草稿' }];

export default function AdminPostsPage() {
  const { locale,  t } = useI18n();
  const { user } = useAuth();
  const manager = ['owner', 'admin'].includes(user?.role || '');
  // The dialog may unmount, but the original import keeps its pending/result state.
  const [importHost] = useState(() => typeof document === 'undefined' ? null : document.createElement('div'));
  useEffect(() => { const details = importHost?.querySelector('details'); if (details) details.open = true; }, [importHost, manager]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftPage, setDraftPage] = useState(1), [draftTotal, setDraftTotal] = useState(0);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const { params, page, setPage, update: updateQuery } = useContentListQuery();
  const filter: Filter = params.get('status') === 'published' ? 'published' : params.get('status') === 'draft' ? 'draft' : 'all';
  const [posts, setPosts] = useState<Post[]>([]);
  const [allPosts, setAllPosts] = useState<Post[] | null>(null);
  const [allTotal, setAllTotal] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    const version = ++requestVersion.current;
    setLoading(true); setPosts([]); setMessage(''); setLoadError('');
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
        if (data.page !== page) setPage(data.page, true);
      } catch (error: any) {
        if (version === requestVersion.current) setLoadError(error.message || t("m_2675556aa7"));
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
    if (!(await confirmAction(t("m_56e1da0b1d")))) return;
    setRemoving(`post-${id}`);
    try {
      await api(`/posts/${id}`, { method: 'DELETE' });
      requestVersion.current++; setDraftsLoaded(false);
      notify.success(t("m_5223f91b96"));
      setAllPosts(null); setAllTotal(previous => previous === null ? null : Math.max(0, previous - 1));
      setRefresh(value => value + 1);
    } catch (error: any) {
      setMessage(error.message || t("m_c228558cf2"));
    } finally { setRemoving(null); }
  }

  async function removeDraft(draft: Draft) {
    if (!(await confirmAction(t("m_e92ff50de5")))) return;
    setRemoving(`draft-${draft.id}`);
    try {
      await api(`/article-drafts/${draft.id}`, { method: 'DELETE', body: JSON.stringify({ version: draft.version }) });
      requestVersion.current++;
      setDrafts(previous => previous.filter(item => item.id !== draft.id));
      setDraftsLoaded(false); setDraftPage(1); setRefresh(value => value + 1);
    } catch (error: any) { setMessage(error.message); }
    finally { setRemoving(null); }
  }

  function rowActions(edit: string, title: string, key: string, remove: () => void, draft = false, view?: string) {
    return <div className="admin-posts-actions">
      <AdminButton asChild variant="ghost" ><Link to={edit}>{t("m_0518365699")}</Link></AdminButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><AdminButton variant="ghost" size="icon" aria-label={t("m_1a42d3b521", {v0: title})} ><MoreHorizontal aria-hidden="true" size={18} /></AdminButton></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="admin-portal ui-v2 admin-posts-menu">
          <DropdownMenuItem asChild><Link to={edit}>{draft ? t("m_41c44e1c68") : t("m_0518365699")}</Link></DropdownMenuItem>
          {view && <DropdownMenuItem asChild><Link to={view}>{t("m_db8db05304")}</Link></DropdownMenuItem>}
          <DropdownMenuItem variant="destructive" disabled={removing === key} onSelect={remove}>{draft ? t("m_1dfe58237b") : t("m_2f9daa8289")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>;
  }

  return <div className="admin-page admin-posts-page ui-v2">
    <div className="admin-page-body">
      <header className="admin-posts-header">
        <div><Link to="/admin" className="admin-posts-back">{t("m_280dc8a5a1")}</Link><div className="admin-posts-heading"><h1>{t("m_4e7cb68111")}</h1>{knownTotal !== null && <span>{t("m_76e547a8fa")} {knownTotal} {t("m_4e7b9204a9")}</span>}</div></div>
        <div className="admin-posts-header-actions">
          {manager&&<AdminButton asChild variant="ghost"><Link to="/admin/taxonomy">{t("m_3fcdff8677")}</Link></AdminButton>}
          {manager && <Dialog>
            <DialogTrigger asChild><AdminButton variant="soft" >{t("m_6ef7cc9ac5")}</AdminButton></DialogTrigger>
            <DialogContent className="admin-portal ui-v2 admin-posts-import-dialog" aria-describedby={undefined}>
              <DialogTitle>{t("m_6ef7cc9ac5")}</DialogTitle>
              <div ref={element => { if (element && importHost && !element.contains(importHost)) element.appendChild(importHost); }} />
            </DialogContent>
          </Dialog>}
          <AdminButton asChild variant="solid" ><Link to="/admin/write">{t("m_13b195d6cc")}</Link></AdminButton>
        </div>
      </header>
      {manager && importHost && createPortal(<ArticleImport />, importHost)}
      <div className="admin-posts-filters" role="group" aria-label={t("m_ca971a625d")}>
        {filters.map(item => <AdminButton key={item.value} variant="ghost" aria-pressed={filter === item.value} onClick={() => updateQuery({ status: item.value === 'all' ? '' : item.value, page: '' })} >{t(item.label)}{counts && <span className="admin-posts-filter-count">{counts[item.value]}</span>}</AdminButton>)}
      </div>
      {message && <div className="admin-posts-message" role="alert">{t(message || '')}</div>}
      {loadError && <div className="admin-posts-message" role="alert">{t(loadError || '')} <AdminButton disabled={loading} variant="ghost" onClick={() => setRefresh(value => value + 1)}>{t("m_b8784c8dd5")}</AdminButton></div>}
      {loading ? <div className="admin-posts-skeleton" role="status" aria-label={t("m_743ae605de")}>
        {[0, 1, 2].map(index => <div className="admin-posts-skeleton-row" key={index}><Skeleton className="admin-posts-skeleton-title" /><Skeleton className="admin-posts-skeleton-meta" /><Skeleton className="admin-posts-skeleton-summary" /></div>)}
      </div> : <div className="admin-posts-list">
        {shownDrafts.map(draft => {
          const title = draft.payload.title || t("m_865f0a03ab"), edit = `/admin/write?draft=${draft.id}`;
          return <article className="admin-posts-row" key={`draft-${draft.id}`}>
            <Link to={edit} className="admin-posts-main"><h2>{title}</h2><p className="admin-posts-meta">{t("m_a94a50985d")} {new Date(draft.updated_at).toLocaleString(locale,{timeZone:'Asia/Shanghai'})}</p></Link>
            <div className="admin-posts-row-end"><span className="admin-posts-status"><span aria-hidden="true" className="admin-posts-status-dot" />{t("m_2a2fd29bd2")}</span>{rowActions(edit, title, `draft-${draft.id}`, () => void removeDraft(draft), true)}</div>
          </article>;
        })}
        {posts.map(post => {
          const edit = `/admin/posts/${post.id}/edit`;
          return <article className="admin-posts-row" key={`post-${post.id}`}>
            <Link to={edit} className="admin-posts-main"><h2>{post.title}</h2><p className="admin-posts-meta">{t("m_f5179cc500")}{post.category || '-'} {t("m_1f4db8c236")}{post.author_name || '-'}</p>{post.summary && <p className="admin-posts-summary">{post.summary}</p>}</Link>
            <div className="admin-posts-row-end">
              {Boolean(Number(post.has_unpublished_zh)) && <span className="admin-posts-unpublished">{t(Number(post.has_unpublished_en) ? 'm_a0a0a0a014' : 'm_a0a0a0a015')}</span>}
              {!Number(post.has_unpublished_zh) && Boolean(Number(post.has_unpublished_en)) && <span className="admin-posts-unpublished">{t('m_a0a0a0a016')}</span>}
              {post.has_unpublished_zh === undefined && post.has_unpublished_en === undefined && Boolean(Number(post.has_unpublished)) && <span className="admin-posts-unpublished">{t("m_41df60ffba")}</span>}
              <span className="admin-posts-status" data-status={post.status}><span aria-hidden="true" className="admin-posts-status-dot" />{post.status === 'published' ? t("m_d334724d6b") : t("m_2a2fd29bd2")}</span>
              {rowActions(edit, post.title, `post-${post.id}`, () => void removePost(post.id), false, post.status === 'published' ? articlePath(post) : undefined)}
            </div>
          </article>;
        })}
        {!message && !loadError && shown === 0 && <div className="admin-posts-empty"><p>{t("m_5c5cb3d539")}</p><AdminButton asChild variant="solid" ><Link to="/admin/write">{t("m_13b195d6cc")}</Link></AdminButton></div>}
      </div>}
      {filter !== 'published' && draftPage * 20 < draftTotal && <div className="admin-posts-more"><AdminButton variant="ghost" disabled={loading} onClick={() => setDraftPage(value => value + 1)} >{t("m_1566278f13")}</AdminButton></div>}
      {pages > 1 ? <nav className="admin-posts-pagination" aria-label={t("m_5cd2beebea")}>
        <AdminButton variant="ghost" disabled={loading || page <= 1} onClick={() => setPage(page - 1)} >{t("m_c9b9ae7a61")}</AdminButton>
        <span>{t("m_76e547a8fa")} {total} {t("m_dfff79c31c")} {page} / {pages} {t("m_d24d3c9946")}</span>
        <AdminButton variant="ghost" disabled={loading || page >= pages} onClick={() => setPage(page + 1)} >{t("m_8a8542f696")}</AdminButton>
      </nav> : !loading && <p className="admin-posts-shown">{t("m_326fee0b90")} {shown} {t("m_4e7b9204a9")}</p>}
    </div>
  </div>;
}
