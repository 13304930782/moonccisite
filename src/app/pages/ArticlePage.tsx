import { Calendar, User, ArrowLeft, MessageCircle, Trash2, Reply } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { MarkdownContent } from '../components/MarkdownContent';
import { CommentSection } from '../components/CommentSection';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function ArticlePage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentContent, setCommentContent] = useState('');
  const [replyContent, setReplyContent] = useState('');
  const [replyTarget, setReplyTarget] = useState<any>(null);
  const [message, setMessage] = useState('正在加载文章...');
  const [commentMessage, setCommentMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadComments = () => {
    if (!id) return;
    api(`/comments/post/${id}`).then(setComments).catch(() => {});
  };

  useEffect(() => {
    if (!id) return;

    api(`/posts/${id}`)
      .then((data) => {
        setPost(data);
        setMessage('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch((err) => {
        setMessage(err.message || '文章加载失败');
      });

    loadComments();
  }, [id]);

  const commentTree = useMemo(() => {
    const top = comments.filter((c) => !c.parent_id);
    const replies = comments.filter((c) => c.parent_id);

    return top.map((item) => ({
      ...item,
      replies: replies.filter((r) => r.parent_id === item.id),
    }));
  }, [comments]);

  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!commentContent.trim()) {
      setCommentMessage('评论内容不能为空');
      return;
    }

    setSubmitting(true);
    setCommentMessage('');

    try {
      await api(`/comments/post/${id}`, {
        method: 'POST',
        body: JSON.stringify({ content: commentContent }),
      });

      setCommentContent('');
      setCommentMessage('评论已提交，正在审核中');
      loadComments();
    } catch (err: any) {
      setCommentMessage(err.message || '评论失败');
    } finally {
      setSubmitting(false);
    }
  };

  const submitReply = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!replyTarget || !replyContent.trim()) {
      setCommentMessage('回复内容不能为空');
      return;
    }

    setSubmitting(true);
    setCommentMessage('');

    try {
      await api(`/comments/post/${id}`, {
        method: 'POST',
        body: JSON.stringify({
          content: replyContent,
          parent_id: replyTarget.parent_id || replyTarget.id,
          reply_to_user_id: replyTarget.user_id,
        }),
      });

      setReplyContent('');
      setReplyTarget(null);
      setCommentMessage('回复已提交，正在审核中');
      loadComments();
    } catch (err: any) {
      setCommentMessage(err.message || '回复失败');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (commentId: number) => {
    if (!window.confirm('确定要删除这条评论吗？')) return;

    try {
      await api(`/comments/${commentId}`, { method: 'DELETE' });
      setCommentMessage('删除成功');
      loadComments();
    } catch (err: any) {
      setCommentMessage(err.message || '删除失败');
    }
  };

  let tags: string[] = [];
  if (post?.tags) {
    try {
      tags = Array.isArray(post.tags) ? post.tags : JSON.parse(post.tags || '[]');
    } catch {
      tags = [];
    }
  }

  const CommentItem = ({ comment, isReply = false }: { comment: any; isReply?: boolean }) => (
    <div className={`${isReply ? 'ml-6 md:ml-10 mt-3' : ''} rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-950/70 px-5 py-4`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span className="font-medium text-gray-900 dark:text-white">{comment.author_name}</span>
            {comment.reply_to_name && <span>回复 @{comment.reply_to_name}</span>}
            <span>{comment.created_at?.slice(0, 10)}</span>
            {comment.ip_address_masked && <span>来自 {comment.ip_address_masked}</span>}
          </div>

          <p className="mt-3 whitespace-pre-wrap leading-7 text-gray-700 dark:text-gray-200">
            {comment.content}
          </p>

          {user && (
            <button
              onClick={() => {
                setReplyTarget(comment);
                setReplyContent('');
              }}
              className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              <Reply className="w-4 h-4" />
              回复
            </button>
          )}
        </div>

        {(['owner', 'admin'].includes(user?.role || '') || user?.id === comment.user_id) && (
          <button
            onClick={() => deleteComment(comment.id)}
            className="shrink-0 rounded-full p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="删除评论"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <Header />

      <main className="px-6 pt-32 pb-20">
        <motion.article
          initial={{ opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-4xl mx-auto rounded-3xl bg-white/85 dark:bg-gray-900/85 backdrop-blur border border-white/40 dark:border-gray-800 p-8 md:p-12 shadow-xl"
        >
          <Link to="/articles" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline">
            <ArrowLeft className="w-4 h-4" />
            返回文章列表
          </Link>

          {message && <div className="mt-8 rounded-xl bg-blue-50 px-4 py-3 text-blue-700">{message}</div>}

          {post && (
            <>
              {post.cover_image && (
                <motion.img
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.5 }}
                  src={post.cover_image}
                  alt={post.title}
                  className="mt-8 w-full max-h-[420px] object-cover rounded-3xl"
                />
              )}

              <div className="mt-8 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span key={tag} className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-medium border border-blue-100 dark:border-blue-800/50">
                    {tag}
                  </span>
                ))}
              </div>

              <h1 className="mt-5 text-4xl md:text-5xl font-bold text-gray-900 dark:text-white leading-tight">
                {post.title}
              </h1>

              <div className="mt-5 flex flex-wrap items-center gap-5 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span>{post.author_name || '作者'}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{post.created_at?.slice(0, 10)}</span>
                </div>

                {post.category && <span>分类：{post.category}</span>}
              </div>

              {post.summary && (
                <p className="mt-8 rounded-2xl bg-gray-50 dark:bg-gray-800/60 px-5 py-4 text-gray-600 dark:text-gray-300 leading-relaxed">
                  {post.summary}
                </p>
              )}

              <MarkdownContent content={post.content || ''} />
</>
          )}
        </motion.article>

        {post && <CommentSection postId={post.id} />}
</main>
    </div>
  );
}
