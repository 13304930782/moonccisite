import { useI18n } from '../i18n';
import { notify } from '../lib/feedback';
import { confirmAction } from '../lib/confirmAction';
import { ThemeSelect } from '../components/ThemeSelect';
import { AdminEmpty, AdminError, AdminLoading, AdminNotice } from '../components/admin/AdminState';
import { AdminButton } from '../components/admin/AdminButton';
import { RefreshCw, Trash2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';

import { api } from '../lib/api';
import '../../styles/admin-ui-v2.css';
import '../../styles/admin-banned-words.css';

export default function AdminBannedWordsPage() {
  const { t } = useI18n();
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
      setLoadError(err.message || t("m_6682b11d4a"));
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
      setMessage(t("m_48fbb834f7"));
      return;
    }
    if (words.some((item) => String(item.word).toLowerCase() === value.toLowerCase())) {
      setMessage(t("m_8d88f2af97", {v0: value}));
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
      notify.success(t("m_ee1a3c93ab"));
      await loadWords();
    } catch (err: any) {
      setMessage(err.message || t("m_2ca15f1e2b"));
    } finally {
      setAdding(false);
    }
  };

  const removeWord = async (item: any) => {
    if (removingId !== null) return;
    if (!(await confirmAction(t("m_84b3d2ea20", {v0: item.word}), t("m_6ca26281ca")))) return;

    setRemovingId(item.id);
    setMessage('');
    try {
      await api(`/admin/banned-words/${item.id}`, { method: 'DELETE' });
      notify.success(t("m_5223f91b96"));
      await loadWords();
    } catch (err: any) {
      notify.error(err.message || t("m_c228558cf2"));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="admin-page banned-words-page ui-v2">
      <div className="admin-page-body">
        <header className="banned-words-heading"><div><h1 className="admin-title">{t("m_e2c664697f")}</h1><p>{t("m_de951f24d5")}</p></div><AdminButton type="button" variant="soft" disabled={loading||adding||removingId!==null} onClick={()=>void loadWords()}><RefreshCw size={16} aria-hidden="true"/>{t('刷新')}</AdminButton></header>

        <form onSubmit={addWord} className="banned-word-form" aria-label={t("m_d409b26546")}>
          <h2>{t("m_d409b26546")}</h2>
          <fieldset disabled={adding} className="banned-word-fields">
          <label className="banned-word-field"><span>{t("m_ddf210db3b")}</span>
          <input aria-label={t("m_ddf210db3b")} value={word} onChange={(e) => setWord(e.target.value)} placeholder={t("m_ddf210db3b")} maxLength={100}
            className="min-h-11 rounded-[10px] border border-border px-4 py-2 bg-card" /></label>

          <div className="banned-word-field banned-word-action"><span id="banned-action-label">{t("m_e74180b523")}</span>
          <ThemeSelect aria-labelledby="banned-action-label" value={action} onValueChange={(nextValue) => setAction(nextValue)} >
            <option value="block">{t("m_bf33347e3c")}</option>
            <option value="replace">{t("m_131b13aa26")}</option>
          </ThemeSelect></div>

          {action === 'replace'
            ? <label className="banned-word-field banned-word-replacement"><span>{t('替换文本')}</span><input aria-label={t('替换文本')} value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder={t('替换文本')} maxLength={100}
                className="min-h-11 rounded-[10px] border border-border px-4 py-2 bg-card" /></label>
            : null}

          <AdminButton type="submit" disabled={adding || !word.trim()} className="banned-word-add">{adding ? t("m_f470193bcd") : t("m_7a8a11ead5")}</AdminButton>
          </fieldset>
          {action === 'block' && <p className="banned-word-hint">{t("m_94639ec92e")}</p>}
          {message && <AdminNotice kind="error">{t(message || '')}</AdminNotice>}
        </form>

        {loading && words.length === 0 && <AdminLoading label={t("m_55b475937b")} />}
        {loadError && <AdminError message={t(loadError || '')} onRetry={() => void loadWords()} />}
        {!loading && !loadError && words.length === 0 && (
          <AdminEmpty title={t("m_eaf6ef8991")} hint={t("m_9e5d4763a3")} />
        )}

        {!!words.length&&<div className="banned-words-list-heading"><h2>{t('已添加词语')}</h2><span role="status">{t('共 {count} 项',{count:words.length})}</span></div>}
        <div className="banned-words-list" aria-busy={loading}>
          {words.map((item) => (
            <div key={item.id} className="banned-word-row">
              <div className="banned-word-copy">
                <strong>{item.word}</strong>
                <p><span className="banned-word-kind">{item.action === 'block' ? t("m_bf33347e3c") : t("m_131b13aa26")}</span>{item.action === 'replace'&&<span className="banned-word-rule">{t("m_17db915a50", {v0: item.replacement || '***'})}</span>}</p>
              </div>

              <div className="banned-word-row-actions">
                <AdminButton type="button" variant="ghost" className="ui-btn--danger" disabled={removingId !== null} onClick={() => void removeWord(item)}
                  aria-label={t("m_725b214d8f", {v0: item.word})}>
                  <Trash2 size={16} aria-hidden="true"/>
                  {removingId === item.id ? t("m_5e8e7af57a") : t("m_2f9daa8289")}
                </AdminButton>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
