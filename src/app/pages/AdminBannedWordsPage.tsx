import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function AdminBannedWordsPage() {
  const [words, setWords] = useState<any[]>([]);
  const [word, setWord] = useState('');
  const [action, setAction] = useState('block');
  const [replacement, setReplacement] = useState('***');
  const [message, setMessage] = useState('');

  const loadWords = () => {
    api('/admin/banned-words')
      .then(setWords)
      .catch((err) => setMessage(err.message || '加载失败'));
  };

  useEffect(() => {
    loadWords();
  }, []);

  const addWord = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!word.trim()) {
      setMessage('违禁词不能为空');
      return;
    }

    try {
      await api('/admin/banned-words', {
        method: 'POST',
        body: JSON.stringify({ word, action, replacement }),
      });

      setWord('');
      setMessage('添加成功');
      loadWords();
    } catch (err: any) {
      setMessage(err.message || '添加失败');
    }
  };

  const removeWord = async (id: number) => {
    if (!window.confirm('确定删除这个违禁词吗？')) return;

    try {
      await api(`/admin/banned-words/${id}`, { method: 'DELETE' });
      setMessage('删除成功');
      loadWords();
    } catch (err: any) {
      setMessage(err.message || '删除失败');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 px-6 py-16">
      <div className="max-w-4xl mx-auto rounded-3xl bg-white/80 backdrop-blur border border-white/40 p-8 shadow-xl">
        <Link to="/admin" className="text-sm text-blue-600 hover:underline">返回后台</Link>
        <h1 className="mt-2 mb-8 text-3xl font-bold text-gray-900">违禁词设置</h1>

        {message && <div className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-blue-700">{message}</div>}

        <form onSubmit={addWord} className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-3">
          <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="违禁词" className="rounded-xl border px-4 py-2 bg-white" />

          <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-xl border px-4 py-2 bg-white">
            <option value="block">拦截</option>
            <option value="replace">替换</option>
          </select>

          <input value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="替换为" className="rounded-xl border px-4 py-2 bg-white" />

          <button className="rounded-xl bg-blue-600 px-5 py-2 text-white">添加</button>
        </form>

        <div className="space-y-3">
          {words.length === 0 && <p className="text-gray-500">暂无违禁词。</p>}

          {words.map((item) => (
            <div key={item.id} className="rounded-2xl border border-gray-200 bg-white/70 px-5 py-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">{item.word}</div>
                <div className="text-sm text-gray-500">
                  处理方式：{item.action === 'block' ? '拦截' : `替换为 ${item.replacement || '***'}`}
                </div>
              </div>

              <button onClick={() => removeWord(item.id)} className="text-red-600 hover:underline">
                删除
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
