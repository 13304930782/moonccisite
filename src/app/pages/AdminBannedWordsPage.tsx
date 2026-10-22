import { notify } from '../lib/feedback';
import { confirmAction } from '../lib/confirmAction';
import { ThemeSelect } from '../components/ThemeSelect';
import { AdminEmpty, AdminError, AdminLoading, AdminNotice } from '../components/admin/AdminState';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function AdminBannedWordsPage() {
  const [words, setWords] = useState<any[]>([]);
  const [word, setWord] = useState('');
  const [action, setAction] = useState('block');
  const [replacement, setReplacement] = useState('***');
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const loadWords = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setWords(await api('/admin/banned-words'));
    } catch (err: any) {
      setLoadError(err.message || '违禁词加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWords();
  }, [loadWords]);

  const addWord = async (event: FormEvent) => {
    event.preventDefault();
    if (adding) return;

    const value = word.trim();
    if (!value) {
      setMessage('违禁词不能为空');
      return;
    }
    if (words.some((item) => String(item.word).toLowerCase() === value.toLowerCase())) {
      setMessage(`“${value}”已经在列表中。`);
      return;
    }

    setAdding(true);
    setMessage('');
    try {
      await api('/admin/banned-words', {
        method: 'POST',
        body: JSON.stringify({ word: value, action, replacement }),
      });

      setWord('');
      notify.success('添加成功');
      await loadWords();
    } catch (err: any) {
      setMessage(err.message || '添加失败'); notify.error(err.message || '添加失败');
    } finally {
      setAdding(false);
    }
  };

  const removeWord = async (item: any) => {
    if (removingId !== null) return;
    if (!(await confirmAction(`确定删除违禁词“${item.word}”吗？`, '删除违禁词'))) return;

    setRemovingId(item.id);
    setMessage('');
    try {
      await api(`/admin/banned-words/${item.id}`, { method: 'DELETE' });
      notify.success('删除成功');
      await loadWords();
    } catch (err: any) {
      setMessage(err.message || '删除失败'); notify.error(err.message || '删除失败');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-body">
        <Link to="/admin" className="text-sm text-foreground hover:underline">返回后台</Link>
        <h1 className="admin-title">违禁词设置</h1>
        <p className="mt-2 mb-6 text-sm text-muted-foreground">命中违禁词的评论会被拦截，或把命中的内容替换后再保存。</p>

        {message && <AdminNotice>{message}</AdminNotice>}

        <form onSubmit={addWord} className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-3" aria-label="添加违禁词">
          <input aria-label="违禁词" value={word} onChange={(e) => setWord(e.target.value)} placeholder="违禁词" maxLength={100}
            className="min-h-11 rounded-[10px] border border-border px-4 py-2 bg-card" />

          <ThemeSelect aria-label="命中处理方式" value={action} onValueChange={(nextValue) => setAction(nextValue)} >
            <option value="block">拦截</option>
            <option value="replace">替换</option>
          </ThemeSelect>

          {action === 'replace'
            ? <input aria-label="替换为" value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="替换为" maxLength={100}
                className="min-h-11 rounded-[10px] border border-border px-4 py-2 bg-card" />
            : <p className="self-center text-sm text-muted-foreground">包含该词的评论会被直接拦截。</p>}

          <button type="submit" disabled={adding || !word.trim()} className="neo-button">{adding ? '添加中…' : '添加'}</button>
        </form>

        {loading && words.length === 0 && <AdminLoading label="正在加载违禁词…" />}
        {loadError && <AdminError message={loadError} onRetry={() => void loadWords()} />}
        {!loading && !loadError && words.length === 0 && (
          <AdminEmpty title="还没有违禁词" hint="在上方输入需要拦截或替换的词语后添加。" />
        )}

        <div className="space-y-3" aria-busy={loading}>
          {words.map((item) => (
            <div key={item.id} className="admin-list-row flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium text-foreground break-words">{item.word}</div>
                <div className="text-sm text-muted-foreground">
                  处理方式：{item.action === 'block' ? '拦截' : `替换为 ${item.replacement || '***'}`}
                </div>
              </div>

              <div className="admin-row-actions">
                <button type="button" data-tone="danger" disabled={removingId !== null} onClick={() => void removeWord(item)}
                  aria-label={`删除违禁词 ${item.word}`}>
                  {removingId === item.id ? '删除中…' : '删除'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
