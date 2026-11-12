import { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../i18n';
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle, DialogDescription } from './ui/dialog';
import { AnswerCloud } from './AnswerCloud';
import '../../styles/daily-question.css';

export type DailyQuestion = { active: true; id: number; text: string; choices: string[] | null; answered: boolean };
type Preview = { type: 'choice'; total: number; counts: number[] } | { type: 'wordcloud'; total: number; words: { text: string; count: number }[]; pendingReview?: boolean };

export function useDailyQuestion() {
  const [question, setQuestion] = useState<DailyQuestion | null>(null);
  const [summary, setSummary] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const currentRevision = revision.current;
    try {
      const value = await api('/daily-question', { cache: 'no-store', timeoutMs: 8000 });
      if (revision.current === currentRevision) setQuestion(value.active && Number.isInteger(value.id) && typeof value.text === 'string' ? value : null);
    } catch { if (revision.current === currentRevision) setQuestion(null); }
  }, []);
  useEffect(() => {
    let active = true;
    const update = () => {
      if (document.hidden) return;
      void refresh();
      void api('/daily-question/summary', { cache: 'no-store', timeoutMs: 8000 }).then(value => {
        if (active) setSummary(typeof value.summary === 'string' ? value.summary : '');
      }).catch(() => { if (active) setSummary(''); });
    };
    update();
    const timer = setInterval(update, 60000);
    document.addEventListener('visibilitychange', update);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [refresh]);
  async function submit(answer: { choiceIndex: number } | { text: string }) {
    if (busy) return false;
    setBusy(true); setError('');
    revision.current += 1;
    try {
      const value = await api('/daily-question/answers', { method: 'POST', body: JSON.stringify(answer) });
      setQuestion(current => current ? { ...current, answered: true } : null);
      if (value.preview) { setPreview(value.preview); setPreviewOpen(true); }
      return true;
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) { await refresh(); setError('你今天已经回答过了。'); }
      else if (failure instanceof ApiError && failure.status === 403) { await refresh(); setError('今天的回答时间已结束。'); }
      else setError('提交失败，请稍后重试。');
      return false;
    } finally { setBusy(false); }
  }
  async function showPreview() {
    if (busy) return;
    setBusy(true); setError('');
    try { const value = await api('/daily-question/preview', { cache: 'no-store' }); setPreview(value.preview); setPreviewOpen(true); }
    catch { setError('暂时无法加载回答预览，请重试。'); }
    finally { setBusy(false); }
  }
  return { question, summary, preview, previewOpen, setPreviewOpen, busy, error, submit, showPreview };
}

type DailyState = ReturnType<typeof useDailyQuestion>;
export function DailyQuestionCard({ daily, onReceived }: { daily: DailyState; onReceived: () => void }) {
  const { t } = useI18n();
  const [selection, setSelection] = useState<number | null>(null);
  const [text, setText] = useState('');
  const question = daily.question;
  useEffect(() => { setSelection(null); setText(''); }, [question?.id]);
  if (!question) return null;
  return <section className="daily-question-card" aria-label={t('每日一问')}>
    <div className="daily-question-header"><span>{t('今日一问')}</span>{question.answered && <span>{t('已回答')}</span>}</div>
    <h3>{question.text}</h3>
    {question.answered ? <button type="button" className="daily-question-secondary" disabled={daily.busy} onClick={() => void daily.showPreview()}>{t('查看回答预览')}</button> :
      <form onSubmit={event => { event.preventDefault(); const answer = question.choices ? selection === null ? null : { choiceIndex: selection } : text.trim() ? { text: text.trim() } : null; if (answer) void daily.submit(answer).then(ok => { if (ok) { setText(''); onReceived(); } }); }}>
        {question.choices ? <fieldset><legend className="sr-only">{t('选择一个答案')}</legend>{question.choices.map((choice, index) => <label className="daily-question-choice" key={index}><input type="radio" name="daily-question-choice" checked={selection === index} onChange={() => setSelection(index)} /><span>{choice}</span></label>)}</fieldset> : <label className="daily-question-answer"><span>{t('你的回答')}</span><textarea maxLength={80} rows={3} value={text} onChange={event => setText(event.target.value)} placeholder={t('写下你的想法')} /><small>{text.length} / 80</small></label>}
        <button type="submit" className="daily-question-submit" disabled={daily.busy || (question.choices ? selection === null : !text.trim())}>{daily.busy ? t('提交中…') : t('提交回答')}</button>
      </form>}
    {daily.error && <p className="daily-question-error" role="alert">{t(daily.error)}</p>}
  </section>;
}

export function DailyQuestionResult({ daily }: { daily: DailyState }) {
  const { t } = useI18n();
  const preview = daily.preview;
  const question = daily.question;
  return <Dialog open={daily.previewOpen} onOpenChange={daily.setPreviewOpen}><DialogPortal>
    <DialogOverlay className="daily-result-overlay" />
    <DialogPrimitive.Content className="daily-result-dialog" onCloseAutoFocus={event => { event.preventDefault(); document.querySelector<HTMLButtonElement>('.daily-question-secondary')?.focus(); }}>
      <DialogClose className="daily-result-close" aria-label={t('关闭')}><X size={18} aria-hidden="true" /></DialogClose>
      <DialogTitle className="daily-result-title">{t('回答预览')}</DialogTitle>
      <DialogDescription className="daily-result-description">{t('仅汇总，不展示原文。')}</DialogDescription>
      {preview?.type === 'choice' && <div className="daily-result-choices">{preview.counts.map((count, index) => {
        const percent = preview.total ? Math.round(count / preview.total * 100) : 0;
        return <div className="daily-result-choice" key={index}><div><span>{question?.choices?.[index] || `${t('选项')} ${index + 1}`}</span><strong>{percent}%</strong></div><div className="daily-result-track" role="meter" aria-label={question?.choices?.[index] || `${t('选项')} ${index + 1}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div><small>{t('票数')} {count}</small></div>;
      })}</div>}
      {preview?.type === 'wordcloud' && (preview.pendingReview ? <p>{t('词云正在等待审核，通过后才会公开。')}</p> : preview.words.length ? <AnswerCloud words={preview.words} /> : <p>{t('重复内容还不够，暂时无法生成词云。')}</p>)}
      <p className="daily-result-count">{t('共 {count} 人回答', { count: preview?.total || 0 })}</p>
      <DialogClose className="daily-result-done">{t('完成')}</DialogClose>
    </DialogPrimitive.Content>
  </DialogPortal></Dialog>;
}
