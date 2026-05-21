import { FormEvent, useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { api } from '../lib/api';

export default function AdminSendMailPage() {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!to.trim()) {
      setMessage('请填写收件人邮箱');
      return;
    }

    if (!subject.trim()) {
      setMessage('请填写邮件标题');
      return;
    }

    if (!content.trim()) {
      setMessage('请填写邮件内容');
      return;
    }

    setSending(true);
    setMessage('');

    try {
      const res = await api('/settings/mail/send-custom', {
        method: 'POST',
        body: JSON.stringify({ to, subject, content }),
      });

      setMessage(res.message || '邮件已发送');
      setSubject('');
      setContent('');
    } catch (err: any) {
      setMessage(err.message || '邮件发送失败');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="rounded-[2rem] bg-white/85 backdrop-blur border border-white/50 p-8 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 text-white flex items-center justify-center shadow-lg">
            <Mail className="w-7 h-7" />
          </div>

          <div>
            <h1 className="text-3xl font-bold text-gray-900">发送邮件</h1>
            <p className="mt-2 text-gray-500">
              使用后台 SMTP 配置，手动向指定邮箱发送邮件。
            </p>
          </div>
        </div>

        {message && (
          <div className="mt-6 rounded-2xl bg-blue-50 px-5 py-4 text-sm text-blue-700">
            {message}
          </div>
        )}

        <form onSubmit={submit} className="mt-8 space-y-5">
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">
              收件人邮箱
            </label>
            <input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="example@gmail.com"
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">
              邮件标题
            </label>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="请输入邮件标题"
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">
              邮件内容
            </label>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={10}
              placeholder="请输入邮件正文，支持换行。"
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Send className="w-4 h-4" />
            {sending ? '发送中...' : '发送邮件'}
          </button>
        </form>
      </div>
    </div>
  );
}
