import { ThemeSelect } from '../components/ThemeSelect';
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
    <div className="admin-page">
      <div className="admin-page-body">
        <Link to="/admin" className="text-sm text-foreground hover:underline">返回后台</Link>
        <h1 className="admin-title">违禁词设置</h1>

        {message && <div className="mb-4 rounded-[6px] bg-muted px-4 py-3 text-foreground">{message}</div>}

        <form onSubmit={addWord} className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-3">
          <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="违禁词" className="rounded-[6px] border px-4 py-2 bg-card" />

          <ThemeSelect value={action} onValueChange={(nextValue) => setAction(nextValue)} className="rounded-[6px] border px-4 py-2 bg-card">
            <option value="block">拦截</option>
            <option value="replace">替换</option>
          </ThemeSelect>

          <input value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="替换为" className="rounded-[6px] border px-4 py-2 bg-card" />

          <button className="rounded-[6px] bg-muted px-5 py-2 text-foreground">添加</button>
        </form>

        <div className="space-y-3">
          {words.length === 0 && <p className="text-muted-foreground">暂无违禁词。</p>}

          {words.map((item) => (
            <div key={item.id} className="admin-list-row flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-foreground">{item.word}</div>
                <div className="text-sm text-muted-foreground">
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
