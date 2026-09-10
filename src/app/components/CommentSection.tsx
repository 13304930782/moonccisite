import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, MessageCircle, Reply, Send, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

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

function getRoleBadge(role?: string) {
  if (role === 'owner') {
    return (
      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground shadow-none">
        站长
      </span>
    );
  }
  if (role === 'admin') {
    return (
      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground shadow-none">
        管理员
      </span>
    );
  }
  if (role === 'editor') {
    return (
      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground shadow-none">
        编辑
      </span>
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

export function CommentSection({ postId, updateId }: { postId?: number | string; updateId?: number | string }) {
  const { user } = useAuth();
  return <CommentThread key={`${updateId ? 'update' : 'post'}:${updateId || postId}:${user?.id || 'guest'}`} postId={postId} updateId={updateId} />;
}
function CommentThread({ postId, updateId }: { postId?: number | string; updateId?: number | string }) {
  const targetId = updateId || postId;
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

  const loadComments = () => {
    const version = ++requestVersion.current;
    setCommentsLoading(true);
    api(endpoint + '?sort=' + sort)
      .then(rows => { if (version === requestVersion.current) setComments(rows); })
      .catch((err) => { if (version === requestVersion.current) setMessage(err.message || '评论加载失败'); })
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
      setMessage('请先登录后再评论');
      return;
    }

    if (!content.trim()) {
      setMessage('评论内容不能为空');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await api(endpoint, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });

      setMessage(res.message || '评论已提交');
      setContent('');
      loadComments();
    } catch (err: any) {
      setMessage(err.message || '评论提交失败');
    } finally {
      setLoading(false);
    }
  };

  const submitReply = async (event: FormEvent) => {
    event.preventDefault();

    if (!user || !replyingTo) return;

    if (!replyContent.trim()) {
      setMessage('回复内容不能为空');
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

      setMessage(res.message || '回复已提交');
      setReplyContent('');
      setReplyingTo(null);
      loadComments();
    } catch (err: any) {
      setMessage(err.message || '回复提交失败');
    } finally {
      setSubmittingReply(false);
    }
  };

  const toggleLike = async (comment: Comment) => {
    if (!user) {
      setMessage('请先登录后再点赞');
      return;
    }

    if (comment.status !== 'visible') {
      setMessage('审核中的评论暂不能点赞');
      return;
    }

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
      setMessage(err.message || '操作失败');
    }
  };

  const deleteComment = async (comment: Comment) => {
    if (!window.confirm('确定要删除这条评论吗？')) return;

    try {
      const res = await api('/comments/' + comment.id, { method: 'DELETE' });
      setMessage(res.message || '评论已删除');
      loadComments();
    } catch (err: any) {
      setMessage(err.message || '删除失败');
    }
  };

  const renderCommentItem = (item: Comment, isReply: boolean = false) => {
    return (
      <div key={item.id} className={isReply ? 'ml-5 md:ml-10 mt-3' : ''}>
        <div className={`comment-item comment-item--${item.status}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground flex items-center gap-2">{item.author_avatar && <img src={item.author_avatar} alt="" width="28" height="28" className="rounded-full object-cover"/>}
              {item.author_name}{item.author_deleted && <small className="deleted-account-label">已删除</small>}
            </span>

            {getRoleBadge(item.author_role)}

            {item.reply_to_name && (
              <span className="text-foreground">
                回复 @{item.reply_to_name}
              </span>
            )}

            <span>{item.created_at?.slice(0, 10)}</span>
            {item.ip_location && <span>来自 {item.ip_location}</span>}

            {item.status === 'pending' && (
              <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs text-yellow-700">
                审核中
              </span>
            )}

            {item.status === 'rejected' && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs text-red-700">
                未通过审核
              </span>
            )}
          </div>

          <p className="mt-3 whitespace-pre-wrap leading-7 text-foreground ">
            {item.content}
          </p>

          {item.status === 'pending' && (
            <p className="mt-2 text-sm text-yellow-700">
              这条评论只有你自己能看到，管理员审核通过后才会公开显示。
            </p>
          )}

          {item.status === 'rejected' && (
            <p className="mt-2 text-sm text-red-700">
              这条评论未通过审核，只有你自己能看到。
            </p>
          )}

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => toggleLike(item)}
              disabled={item.status !== 'visible'}
              className={
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ' +
                (item.liked_by_me
                  ? 'bg-red-50 text-red-600'
                  : 'bg-muted text-muted-foreground hover:text-red-600') +
                ' disabled:opacity-50'
              }
            >
              <Heart
                className={
                  'w-4 h-4 ' + (item.liked_by_me ? 'fill-current' : '')
                }
              />
              {item.like_count || 0}
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
                回复
              </button>
            )}

            {canDelete(user, item) && (
              <button
                onClick={() => deleteComment(item)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-red-600 hover:bg-red-50 transition"
              >
                <Trash2 className="w-4 h-4" />
                删除
              </button>
            )}
          </div>
        </div>

        {replyingTo?.id === item.id && (
          <form
            onSubmit={submitReply}
            className={'mt-3 ' + (isReply ? 'ml-5 md:ml-10' : '')}
          >
            <div className="rounded-[10px] border border-border bg-muted p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground">
                  回复 @{item.author_name}
                </span>
                <button
                  type="button"
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
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                rows={3}
                placeholder={'回复 @' + item.author_name + '...'}
                className="w-full rounded-[6px] border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />

              <div className="mt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={submittingReply || !replyContent.trim()}
                  className="inline-flex items-center gap-1.5 rounded-[6px] bg-muted px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-60"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submittingReply ? '提交中...' : '回复'}
                </button>
              </div>
            </div>
          </form>
        )}

        {item.replies && item.replies.length > 0 && (
          <div className="border-l border-border  ml-2 md:ml-4">
            {item.replies.map((reply) => renderCommentItem(reply, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section
      className="comment-section"
      aria-labelledby={`comments-heading-${postId}`}
    >
      <div className="comment-header">
        <h2 id={`comments-heading-${postId}`}>
          <MessageCircle aria-hidden="true" />
          评论
        </h2>
        <div className="comment-sort" role="group" aria-label="评论排序">
          {sortOptions.map((item) => (
            <button
              type="button"
              key={item.value}
              onClick={() => setSort(item.value)}
              aria-pressed={sort === item.value}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="comment-account">
        {user ? (
          <>
            <p>
              <strong>{user.username}</strong>
              <span>{getRoleName(user.role)}</span>
            </p>
            <p>{getCommentRule(user.role)}</p>
          </>
        ) : (
          <p>登录后参与讨论。</p>
        )}
      </div>

      {message && (
        <div className="mt-5 rounded-[10px] bg-muted px-4 py-3 text-sm text-foreground">
          {message}
        </div>
      )}

      <form onSubmit={submit} className="mt-6">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder={
            user
              ? ['owner', 'admin', 'editor'].includes(user.role)
                ? '写下你的评论…'
                : '写下你的评论，审核通过后公开…'
              : '请先登录后再评论'
          }
          className="w-full rounded-[10px] border border-border  bg-card  px-4 py-3 outline-none focus:ring-2 focus:ring-ring text-foreground "
        />

        <div className="mt-3 flex justify-end">
          <button
            disabled={loading || !user}
            className="inline-flex items-center gap-2 rounded-[10px] bg-muted px-5 py-3 text-foreground hover:bg-muted disabled:opacity-60"
          >
            <Send className="w-4 h-4" />
            {loading ? '提交中...' : '发表评论'}
          </button>
        </div>
      </form>

      <div className="mt-8 space-y-2" aria-busy={commentsLoading}>
        {commentsLoading && comments.length === 0 && <p className="quiet-state" role="status">正在读取评论…</p>}
        {!commentsLoading && !message && comments.length === 0 && (
          <div className="rounded-[10px] bg-muted  px-5 py-8 text-center text-muted-foreground">
            暂无评论
          </div>
        )}

        {commentTree.map((item) => renderCommentItem(item, false))}
      </div>
    </section>
  );
}
// Comment interface
