import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Heart, MessageCircle, Reply, Send, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

type Comment = {
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
      <span className="rounded-full bg-gradient-to-r from-purple-600 to-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm">
        站长
      </span>
    );
  }
  if (role === 'admin') {
    return (
      <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm">
        管理员
      </span>
    );
  }
  if (role === 'editor') {
    return (
      <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm">
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
  if (role === 'owner') return '无需审核，站长评论发布后直接显示，并拥有最高审核权限。';
  if (role === 'admin') return '无需审核，管理员评论发布后直接显示。';
  if (role === 'editor') return '无需审核，编辑评论发布后直接显示。';
  return '需要审核，管理员通过后才会公开显示；你自己的待审核评论会优先显示。';
}

export function CommentSection({ postId }: { postId: number | string }) {
  const { user } = useAuth();

  const [comments, setComments] = useState<Comment[]>([]);
  const [sort, setSort] = useState('latest');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  const loadComments = () => {
    api('/comments/post/' + postId + '?sort=' + sort)
      .then(setComments)
      .catch((err) => setMessage(err.message || '评论加载失败'));
  };

  useEffect(() => {
    if (!postId) return;
    loadComments();
  }, [postId, sort, user?.id]);

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
      const res = await api('/comments/post/' + postId, {
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
      const res = await api('/comments/post/' + postId, {
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
    const borderColors = item.author_role === 'owner'
      ? 'border-purple-300 bg-gradient-to-br from-purple-50 via-white to-blue-50 shadow-sm shadow-purple-200/40'
      : item.author_role === 'admin'
        ? 'border-blue-200 bg-blue-50/70 shadow-sm shadow-blue-100/50'
        : item.status === 'pending'
          ? 'border-yellow-200 bg-yellow-50/70'
          : item.status === 'rejected'
            ? 'border-red-200 bg-red-50/70'
            : 'border-gray-200 bg-white/75 dark:border-gray-800 dark:bg-gray-950/50';

    return (
      <div key={item.id} className={isReply ? 'ml-5 md:ml-10 mt-3' : ''}>
        <div className={'rounded-2xl border p-4 ' + borderColors}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
            <span className="font-medium text-gray-900 dark:text-white">
              {item.author_name}
            </span>

            {getRoleBadge(item.author_role)}

            {item.reply_to_name && (
              <span className="text-blue-600">
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

          <p className="mt-3 whitespace-pre-wrap leading-7 text-gray-800 dark:text-gray-200">
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
                  : 'bg-gray-100 text-gray-500 hover:text-red-600') +
                ' disabled:opacity-50'
              }
            >
              <Heart className={'w-4 h-4 ' + (item.liked_by_me ? 'fill-current' : '')} />
              {item.like_count || 0}
            </button>

            {user && item.status === 'visible' && (
              <button
                onClick={() => {
                  setReplyingTo(item);
                  setReplyContent('');
                }}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition"
              >
                <Reply className="w-4 h-4" />
                回复
              </button>
            )}

            {canDelete(user, item) && (
              <button
                onClick={() => deleteComment(item)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
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
            <div className="rounded-2xl border border-blue-300 bg-blue-50/50 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-blue-700">
                  回复 @{item.author_name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setReplyingTo(null);
                    setReplyContent('');
                  }}
                  className="rounded-full p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                rows={3}
                placeholder={'回复 @' + item.author_name + '...'}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />

              <div className="mt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={submittingReply || !replyContent.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submittingReply ? '提交中...' : '回复'}
                </button>
              </div>
            </div>
          </form>
        )}

        {item.replies && item.replies.length > 0 && (
          <div className="border-l-2 border-blue-200 dark:border-blue-800 ml-2 md:ml-4">
            {item.replies.map((reply) => renderCommentItem(reply, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="mt-12 rounded-[2rem] bg-white/80 dark:bg-gray-900/80 backdrop-blur border border-gray-200/50 dark:border-gray-800/50 p-6 md:p-8 shadow-lg shadow-black/5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-blue-600" />
            评论
          </h2>
          <div className="mt-2 rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800">
            {user ? (
              <div className="space-y-1">
                <p>你的用户名：<span className="font-semibold">{user.username}</span></p>
                <p>网站身份：<span className="font-semibold">{getRoleName(user.role)}</span></p>
                <p>评论规则：<span className="font-semibold">{getCommentRule(user.role)}</span></p>
              </div>
            ) : (
              <div className="space-y-1">
                <p>当前状态：<span className="font-semibold">未登录</span></p>
                <p>评论规则：登录后才可以发表评论。</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex rounded-2xl bg-gray-100 dark:bg-gray-800 p-1">
          {sortOptions.map((item) => (
            <button
              key={item.value}
              onClick={() => setSort(item.value)}
              className={
                'rounded-xl px-4 py-2 text-sm transition ' +
                (sort === item.value
                  ? 'bg-white dark:bg-gray-950 text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white')
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div className="mt-5 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {message}
        </div>
      )}

      <form onSubmit={submit} className="mt-6">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder={user ? '写下你的评论，提交后等待审核...' : '请先登录后再评论'}
          className="w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
        />

        <div className="mt-3 flex justify-end">
          <button
            disabled={loading || !user}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Send className="w-4 h-4" />
            {loading ? '提交中...' : '发表评论'}
          </button>
        </div>
      </form>

      <div className="mt-8 space-y-2">
        {comments.length === 0 && (
          <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/60 px-5 py-8 text-center text-gray-500">
            暂无评论
          </div>
        )}

        {commentTree.map((item) => renderCommentItem(item, false))}
      </div>
    </section>
  );
}
// __MOONCCI_V2__
