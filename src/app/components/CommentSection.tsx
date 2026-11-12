import { useI18n } from '../i18n';
import { notify } from '../lib/feedback';
import { confirmAction } from '../lib/confirmAction';
import { EmptyState } from './DetailUI';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, MessageCircle, Reply, Send, Trash2, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import {Link} from './LocaleLink';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatCommentTime } from '../lib/commentTime';

type Comment = {
  replies?: Comment[];
  id: number;
  post_id: number;
  user_id: number;
  parent_id: number | null;
  reply_to_user_id: number | null;
  content: string;
  status: 'pending' | 'visible' | 'hidden' | 'deleted' | 'rejected';
  status_text?: string;
  created_at: string;
  author_name: string;
  author_deleted?: string;
  author_avatar?: string;
  author_role?: 'owner' | 'admin' | 'editor' | 'user';
  reply_to_name?: string;
  ip_address_masked?: string;
  ip_location?: string;
  like_count: number;
  liked_by_me: boolean;
};

const sortOptions = [
  { label: '最新', value: 'latest' },
  { label: '最早', value: 'oldest' },
  { label: '点赞量', value: 'likes' },
];

function getRoleName(role?: string) {
  if (role === 'owner') return '站长';
  if (role === 'admin') return '管理员';
  if (role === 'editor') return '编辑';
  return '普通用户';
}

function RoleBadge({role}: {role?: string}) {
  const {t}=useI18n();
  if (role === 'owner') {
    return (
      <span className="comment-role-badge rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground shadow-none">
         {t("m_b2118962f8")} </span>
    );
  }
  if (role === 'admin') {
    return (
      <span className="comment-role-badge rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground shadow-none">
         {t("m_e19796712f")} </span>
    );
  }
  if (role === 'editor') {
    return (
      <span className="comment-role-badge rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground shadow-none">
         {t("m_0518365699")} </span>
    );
  }
  return null;
}

function canDelete(user: any, comment: Comment) {
  if (!user) return false;
  if (user.role === 'owner') return true;
  if (user.role === 'admin' && comment.author_role !== 'owner') return true;
  if (Number(user.id) === Number(comment.user_id)) return true;
  return false;
}

function getCommentRule(role?: string) {
  if (['owner', 'admin', 'editor'].includes(role || ''))
    return '你的评论发布后直接显示。';
  return '评论审核通过后公开，待审核内容仅你自己可见。';
}

type CommentSectionProps = { postId?: number | string; updateId?: number | string; compact?: boolean; variant?: 'note'; onCountChange?: (count: number) => void };
export function CommentSection({ postId, updateId, compact = false, variant, onCountChange }: CommentSectionProps) {
  const { user } = useAuth();
  return <CommentThread key={`${updateId ? 'update' : 'post'}:${updateId || postId}:${user?.id || 'guest'}`} postId={postId} updateId={updateId} compact={compact} variant={variant} onCountChange={onCountChange} />;
}
function CommentThread({ postId, updateId, compact = false, variant, onCountChange }: CommentSectionProps) {
  const { t } = useI18n();
  const note = variant === 'note';
  const composeRef = useRef<HTMLTextAreaElement>(null);
  const [newCommentId, setNewCommentId] = useState<number | null>(null);
  const [likeMotion, setLikeMotion] = useState<{ id: number; version: number } | null>(null);
  const targetId = updateId || postId;
  const location = useLocation();
  const threadId = `comments-${updateId ? 'update' : 'post'}-${targetId}`;
  const [expanded, setExpanded] = useState(false);
  const [openReplies, setOpenReplies] = useState<Set<number>>(new Set());
  const [openText, setOpenText] = useState<Set<number>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const toggleSet = (set: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) => set(old => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const endpoint = '/comments/' + (updateId ? 'update/' : 'post/') + targetId;
  const { user } = useAuth();

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const requestVersion = useRef(0);
  const [sort, setSort] = useState('latest');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  useEffect(() => {
    if (note) onCountChange?.(comments.length);
  }, [note, comments.length, onCountChange]);

  useEffect(() => {
    const input = composeRef.current;
    if (!note || !input) return;
    const resize = () => {
      const styles = getComputedStyle(input);
      const lineHeight = parseFloat(styles.lineHeight) || 24;
      const padding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, lineHeight * 6 + padding) + 'px';
      input.style.overflowY = input.scrollHeight > lineHeight * 6 + padding ? 'auto' : 'hidden';
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [note, content, user?.id]);

  const loadComments = (submitted?: { content: string; knownIds: Set<number> }) => {
    const version = ++requestVersion.current;
    setCommentsLoading(true);
    api(endpoint + '?sort=' + sort)
      .then(rows => { if (version === requestVersion.current) {
        setComments(rows);
        if (note && submitted) {
          // The API returns no ID; animate only a new matching comment by this account.
          const added = rows.find((row: Comment) => !submitted.knownIds.has(row.id) && Number(row.user_id) === Number(user?.id) && row.content.trim() === submitted.content.trim());
          if (added) setNewCommentId(added.id);
        }
      } })
      .catch((err) => { if (version === requestVersion.current) setMessage(err.message || t("m_30c1e32d76")); })
      .finally(() => { if (version === requestVersion.current) setCommentsLoading(false); });
  };

  useEffect(() => {
    if (!targetId) return;
    loadComments();
    return () => { requestVersion.current++; };
  }, [endpoint, sort, user?.id]);

  const commentTree = useMemo(() => {
    const top = comments.filter((c) => !c.parent_id);
    const replies = comments.filter((c) => c.parent_id);
    return top.map((item) => ({
      ...item,
      replies: replies.filter((r) => r.parent_id === item.id),
    }));
  }, [comments]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!user) {
      setMessage(t("m_3c34a51f63"));
      return;
    }

    if (!content.trim()) {
      setMessage(t("m_b64ad99236"));
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await api(endpoint, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });

      notify.success(res.message || t("m_6b03cd1822"));
      setContent('');
      loadComments(note ? { content, knownIds: new Set(comments.map(item => item.id)) } : undefined);
    } catch (err: any) {
      setMessage(err.message || t("m_e7a9a2610b"));
    } finally {
      setLoading(false);
    }
  };

  const submitReply = async (event: FormEvent) => {
    event.preventDefault();

    if (!user || !replyingTo) return;

    if (!replyContent.trim()) {
      setMessage(t("m_ee880db65f"));
      return;
    }

    setSubmittingReply(true);
    setMessage('');

    try {
      const res = await api(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          content: replyContent,
          parent_id: replyingTo.parent_id || replyingTo.id,
          reply_to_user_id: replyingTo.user_id,
        }),
      });

      notify.success(res.message || t("m_a43fc5a8f0"));
      setReplyContent('');
      setReplyingTo(null);
      loadComments(note ? { content: replyContent, knownIds: new Set(comments.map(item => item.id)) } : undefined);
    } catch (err: any) {
      setMessage(err.message || t("m_36fadc3147"));
    } finally {
      setSubmittingReply(false);
    }
  };

  const toggleLike = async (comment: Comment) => {
    if (!user) {
      setMessage(t("m_d0eff89151"));
      return;
    }

    if (comment.status !== 'visible') {
      setMessage(t("m_ac9e7d8d10"));
      return;
    }

    if (note) setLikeMotion(previous => ({ id: comment.id, version: (previous?.version || 0) + 1 }));
    try {
      if (comment.liked_by_me) {
        await api('/comments/' + comment.id + '/like', { method: 'DELETE' });
      } else {
        await api('/comments/' + comment.id + '/like', {
          method: 'POST',
          body: JSON.stringify({}),
        });
      }

      loadComments();
    } catch (err: any) {
      setMessage(err.message || t("m_0c3b4cf7aa"));
    }
  };

  const deleteComment = async (comment: Comment) => {
    if (!(await confirmAction(t("m_fa73e0c1a6")))) return;

    try {
      const res = await api('/comments/' + comment.id, { method: 'DELETE' });
      notify.success(res.message || t("m_c9e7f26c74"));
      loadComments();
    } catch (err: any) {
      setMessage(err.message || t("m_c228558cf2"));
    }
  };

  const renderCommentItem = (item: Comment, isReply: boolean = false) => {
    return (
      <div key={item.id} className={`comment-thread${isReply?' comment-reply ml-5 md:ml-10 mt-3':''}`}>
        <div className={`comment-item comment-item--${item.status}${note ? ' note-comment-item' + (item.author_role === 'owner' ? ' note-comment-owner' : '') + (newCommentId === item.id ? ' note-comment-new' : '') : ''}`} onAnimationEnd={note ? event => { if (event.target === event.currentTarget && newCommentId === item.id) setNewCommentId(null); } : undefined}>
          <div className="comment-meta flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground flex items-center gap-2">{item.author_avatar?<img src={item.author_avatar} alt="" width="28" height="28" className="rounded-full object-cover"/>:<span className="comment-avatar-fallback" aria-hidden="true">{item.author_name.slice(0,1)}</span>}
              {item.author_name}{item.author_deleted && <small className="deleted-account-label">{t("m_077a6d3771")}</small>}
            </span>

            <RoleBadge role={item.author_role}/>

            {item.reply_to_name && (
              <span className="text-foreground">
                 {t("m_e1f1de2f03")}{item.reply_to_name}
              </span>
            )}

            <span>{formatCommentTime(item.created_at)}</span>
            {item.ip_location && <span>{t("m_9b6a4a82e3")} {note ? item.ip_location.replace(/^中国\s*(?=\S)/u, '') : item.ip_location}</span>}

            {item.status === 'pending' && (
              <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs text-yellow-700">
                 {t("m_a9f71b911f")} </span>
            )}

            {item.status === 'rejected' && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs text-red-700">
                 {t("m_96ad893e23")} </span>
            )}
          </div>

          <p id={`${threadId}-text-${item.id}`} className={`comment-text mt-3 whitespace-pre-wrap leading-7 text-foreground ${compact && (item.content.length > 140 || item.content.split('\n').length > 4) && !openText.has(item.id) ? 'comment-text-preview' : ''}`}>
            {item.content}
          </p>
          {compact && (item.content.length > 140 || item.content.split('\n').length > 4) && <button type="button" className="comment-expand" aria-expanded={openText.has(item.id)} aria-controls={`${threadId}-text-${item.id}`} onClick={() => toggleSet(setOpenText, item.id)}>{openText.has(item.id) ? t("m_8cacd71189") : t("m_fb654bf587")}</button>}

          {item.status === 'pending' && (
            <p className="mt-2 text-sm text-yellow-700">
               {t("m_0bb1d65bab")} </p>
          )}

          {item.status === 'rejected' && (
            <p className="mt-2 text-sm text-red-700">
               {t("m_4a5bc16950")} </p>
          )}

          <div className="comment-item-actions mt-3 flex items-center gap-3">
            <button
              onClick={() => toggleLike(item)}
              aria-pressed={item.liked_by_me}
              aria-label={note ? t("m_ede7084d01", {v0: item.liked_by_me ? t("m_3ab399c75f") : t("m_aced5d7f9f"), v1: item.like_count || 0}) : undefined}
              disabled={item.status !== 'visible'}
              className={
                'comment-like inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ' +
                (item.liked_by_me
                  ? 'bg-red-50 text-red-600'
                  : 'bg-muted text-muted-foreground hover:text-red-600') +
                ' disabled:opacity-50'
              }
            >
              <Heart
                key={note && likeMotion?.id === item.id ? likeMotion.version : 'heart'}
                data-note-like={note && likeMotion?.id === item.id ? 'clicked' : undefined}
                className={
                  'w-4 h-4 ' + (item.liked_by_me ? 'fill-current' : '')
                }
              />
              {note ? <span className={likeMotion?.id === item.id ? 'note-like-count note-like-count-changed' : 'note-like-count'} key={item.like_count}>{item.like_count || 0}</span> : item.like_count || 0}
            </button>

            {user && item.status === 'visible' && (
              <button
                onClick={() => {
                  setReplyingTo(item);
                  setReplyContent('');
                }}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition"
              >
                <Reply className="w-4 h-4" />
                 {t("m_cf945e21dd")}</button>
            )}

            {canDelete(user, item) && (
              <button
                onClick={() => deleteComment(item)}
                className="comment-delete inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-red-600 hover:bg-red-50 transition"
              >
                <Trash2 className="w-4 h-4" />
                 {t("m_2f9daa8289")}</button>
            )}
          </div>
        </div>

        {replyingTo?.id === item.id && (
          <form
            onSubmit={submitReply}
            className={'comment-reply-compose mt-3 '+(compact&&isReply?'ml-5 md:ml-10':'')}
          >
            <div className="rounded-[10px] border border-border bg-muted p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground">
                   {t("m_e1f1de2f03")}{item.author_name}
                </span>
                <button
                  type="button"
                  aria-label={note ? t("m_d346633d3a") : undefined}
                  onClick={() => {
                    setReplyingTo(null);
                    setReplyContent('');
                  }}
                  className="rounded-full p-1 text-muted-foreground hover:text-muted-foreground hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <textarea
                aria-label={t("m_e1f1de2f03")+item.author_name}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                rows={3}
                placeholder={t("m_e1f1de2f03") + item.author_name + '...'}
                className="w-full rounded-[6px] border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />

              <div className="mt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={submittingReply || !replyContent.trim()}
                  className="inline-flex items-center gap-1.5 rounded-[6px] bg-muted px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-60"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submittingReply ? t("m_2fb1db2875") : t("m_cf945e21dd")}
                </button>
              </div>
            </div>
          </form>
        )}

        {item.replies && item.replies.length > 0 && (
          <div className="comment-replies border-l border-border ml-2 md:ml-4">
            {compact && <button type="button" className="comment-expand" aria-expanded={openReplies.has(item.id)} aria-controls={`${threadId}-replies-${item.id}`} onClick={() => toggleSet(setOpenReplies, item.id)}>{openReplies.has(item.id) ? t("m_c6edf96634") : t("m_b3eea11c4a", {v0: item.replies.length})}</button>}
            <div id={`${threadId}-replies-${item.id}`} hidden={compact && !openReplies.has(item.id)}>{(!compact || openReplies.has(item.id)) && item.replies.map((reply) => renderCommentItem(reply, true))}</div>
          </div>
        )}
      </div>
    );
  };

  if (note) return <section className="comment-section note-discussion" id={threadId} aria-labelledby={`${threadId}-heading`}>
    <div className="comment-header"><h2 id={`${threadId}-heading`} tabIndex={-1}>{t("m_3cef912ce8")} <span className="comment-total">{comments.length}</span></h2>
      <div className="comment-sort" role="group" aria-label={t("m_60985a584f")}>{sortOptions.map(option => <button type="button" key={option.value} aria-pressed={sort === option.value} onClick={() => setSort(option.value)}>{t(option.label)}</button>)}</div>
    </div>
    {message && <p role="alert" className="note-comment-message">{t(message || '')}</p>}
    <div ref={listRef} id={`${threadId}-list`} className="note-comment-list" aria-busy={commentsLoading}>
      {commentsLoading && comments.length === 0 && <p role="status" className="note-comment-empty">{t("m_a1b7cecc70")}</p>}
      {!commentsLoading && !message && comments.length === 0 && <p className="note-comment-empty">{t("m_f65ebfdf5f")}</p>}
      {commentTree.map(item => renderCommentItem(item))}
    </div>
    {user ? <><form onSubmit={submit} className="note-comment-compose" aria-busy={loading}>
      <textarea ref={composeRef} aria-label={t("m_6c66f6a5d8")} value={content} onChange={event => setContent(event.target.value)} rows={1} placeholder={t("m_72a70e767e")} />
      <button type="submit" aria-label={loading ? t("m_5cef84396e") : t("m_0bfca7bdd2")} disabled={loading || !content.trim()}><Send aria-hidden="true" size={20} /></button>
    </form><p className="note-comment-posting-rule">{t("m_09680c3fbe")} {user.username}（{t(getRoleName(user.role))}{t("m_cb1d46eab4")} {['owner', 'admin', 'editor'].includes(user.role) ? t("m_12fa0a6d05") : t("m_7b3d07f659")}</p></> :
      <div className="comment-login-prompt"><p>{t("m_65565f0e2d")}</p><Link className="comment-submit" to={'/login?redirect='+encodeURIComponent((updateId ? '/updates/'+updateId : location.pathname)+'#'+threadId)}>{t("m_1f8c80a8d7")}</Link></div>}
  </section>;

  return (
    <section
      className={`comment-section ${compact ? 'comment-section--compact' : ''}`}
      id={threadId}
      aria-labelledby={`${threadId}-heading`}
    >
      <div className="comment-header">
        <h2 id={`${threadId}-heading`}>
          <MessageCircle aria-hidden="true" />
          {compact ? t("m_3cef912ce8") : t("m_6849b8254d")}{compact && <span className="comment-total">{comments.length}</span>}
        </h2>
        {(!compact || comments.length > 0) && <div className="comment-sort" role="group" aria-label={t("m_60985a584f")}>
          {sortOptions.map((item) => (
            <button
              type="button"
              key={item.value}
              onClick={() => { setSort(item.value); setExpanded(false); setOpenReplies(new Set()); setOpenText(new Set()); }}
              aria-pressed={sort === item.value}
            >
              {t(item.label)}
            </button>
          ))}
        </div>}
      </div>
      {(compact || !user) && (!compact || user) && <div className="comment-account">
        {user ? (
          <>
            <p>
              <strong>{user.username}</strong>
              <span>{t(getRoleName(user.role))}</span>
            </p>
            <p>{t(getCommentRule(user.role))}</p>
          </>
        ) : (
          <p>{t("m_65565f0e2d")}</p>
        )}
      </div>}

      {compact && !user && <div className="comment-login-prompt"><div><strong>{t("m_9510f5da5b")}</strong><p>{comments.length ? t("m_65565f0e2d") : t("m_cfe2d0d132")}</p></div><Link className="comment-submit" to={'/login?redirect='+encodeURIComponent((updateId ? '/updates/'+updateId : location.pathname)+'#'+threadId)}>{t("m_1f8c80a8d7")}</Link></div>}

      {message && (
        <div className="mt-5 rounded-[10px] bg-muted px-4 py-3 text-sm text-foreground">
          {t(message || '')}
        </div>
      )}

      {(!compact || user) && <form onSubmit={submit} className="comment-compose">
        <textarea
          aria-label={t("m_6c66f6a5d8")}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder={
            user
              ? ['owner', 'admin', 'editor'].includes(user.role)
                ? t("m_b99d4fa228")
                : t("m_2a17adb859")
              : t("m_3c34a51f63")
          }
          className="w-full rounded-[10px] border border-border  bg-card  px-4 py-3 outline-none focus:ring-2 focus:ring-ring text-foreground "
        />

        <div className="comment-compose-bottom mt-3 flex justify-end">
          {!compact&&user&&<p className="comment-posting-rule">{t("m_09680c3fbe")} {user.username} {t(getRoleName(user.role))} {t("m_5043198f47")} {t(getCommentRule(user.role))}</p>}
          <button
            disabled={loading || !user}
            className="comment-submit"
          >
            <Send className="w-4 h-4" />
            {loading ? t("m_2fb1db2875") : t("m_0bfca7bdd2")}
          </button>
        </div>
      </form>}

      <div ref={listRef} id={`${threadId}-list`} className={`mt-8 space-y-2 ${compact ? 'comment-preview-list' : ''}`} aria-busy={commentsLoading} tabIndex={compact && comments.length ? 0 : undefined} role={compact ? 'region' : undefined} aria-label={compact ? t("m_8f1290821a") : undefined}>
        {commentsLoading && comments.length === 0 && <p className="quiet-state" role="status">{t("m_a1b7cecc70")}</p>}
        {!commentsLoading && !message && comments.length === 0 && (!compact || user) && (
          <EmptyState>{t("m_fd4c868608")}</EmptyState>
        )}

        {(compact && !expanded ? commentTree.slice(0, 3) : commentTree).map((item) => renderCommentItem(item, false))}
      </div>
      {compact && commentTree.length > 3 && <button type="button" className="comment-fold-toggle" aria-expanded={expanded} aria-controls={`${threadId}-list`} onClick={() => { setExpanded(!expanded); setOpenReplies(new Set()); setOpenText(new Set()); if (listRef.current) listRef.current.scrollTop=0; }}>{expanded ? t("m_45a297eed2") : t("m_e4836c4ebc", {v0: commentTree.length - 3})}</button>}
    </section>
  );
}
// Comment interface
