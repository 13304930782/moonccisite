import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { confirmAction } from '../lib/confirmAction';
import { notify } from '../lib/feedback';
import { useUnsavedLeave } from '../lib/useUnsavedLeave';
import { AdminButton } from './admin/AdminButton';
import '../../styles/daily-question-admin.css';

type Question = {
  id: number; question_date: string; text: string; choices: string[] | null;
  status: 'draft' | 'published' | 'closed'; answer_count: number;
  summary_status: 'none' | 'pending' | 'approved' | 'rejected';
  summary?: string | null; draft_summary?: string | null;
};
type QuestionResponse = { items: Question[]; question: Question | null };
const beijingDate = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + offset * 86400000));
const fields = (question: Question | null) => ({ text: question?.text || '', choices: question?.choices?.length ? [...question.choices] : ['', ''] });
const statusLabels = { draft: '草稿', published: '已发布', closed: '已结束' };
const summaryLabels = { none: '未生成', pending: '待审核', approved: '已通过', rejected: '未公开' };

export function AdminDailyQuestions() {
  const { t } = useI18n();
  const [date, setDate] = useState(() => beijingDate(1));
  const [items, setItems] = useState<Question[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [form, setForm] = useState(() => fields(null));
  const [saved, setSaved] = useState(() => JSON.stringify(fields(null)));
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const dirty = JSON.stringify(form) !== saved;
  useUnsavedLeave(dirty);

  async function load(selectedDate: string) {
    const token = ++generation.current;
    setLoading(true); setLoaded(false); setError('');
    try {
      const result: QuestionResponse = await api(`/admin/daily-questions?date=${encodeURIComponent(selectedDate)}`);
      if (token !== generation.current) return;
      setItems(result.items || []); setQuestion(result.question || null);
      const next = fields(result.question || null); setForm(next); setSaved(JSON.stringify(next));
      setLoaded(true);
    } catch (cause: any) {
      if (token === generation.current) setError(cause.message || t('每日一问加载失败，请重试。'));
    } finally { if (token === generation.current) setLoading(false); }
  }
  useEffect(() => { void load(date); return () => { generation.current++; }; }, [date]);
  async function chooseDate(next: string) {
    if (!next || next === date) return;
    if (dirty && !await confirmAction(t('当前题目有未保存的更改，切换日期将放弃这些更改。'))) return;
    setDate(next);
  }
  async function removeQuestion() {
    if (!question || busy || loading) return;
    const message = t('删除题目将永久删除其 {count} 条回答和总结，无法恢复。确定删除吗？', { count: question.answer_count });
    if (!await confirmAction(message, t('删除题目'))) return;
    setBusy(true); setError('');
    try {
      await api(`/admin/daily-questions/${encodeURIComponent(date)}`, { method: 'DELETE' });
      notify.success(t('题目已删除'));
      await load(date);
    } catch (cause: any) { setError(cause.message || t('操作失败，请重试。')); }
    finally { setBusy(false); }
  }
  async function perform(action: 'save' | 'publish' | 'generate' | 'approve' | 'reject', event?: FormEvent) {
    event?.preventDefault();
    if (busy || loading) return;
    const selected = form.choices.map(value => value.trim()).filter(Boolean);
    if (action === 'save' && (!form.text.trim() || (selected.length > 0 && selected.length < 2))) {
      setError(t(!form.text.trim() ? '请填写题目。' : '请填写至少两个选项，或留空设为开放回答。')); return;
    }
    setBusy(true); setError('');
    try {
      const suffix = action === 'save' ? '' : action === 'publish' ? '/publish' : action === 'generate' ? '/generate' : '/review';
      const body = action === 'save' ? { text: form.text.trim(), choices: selected.length ? selected : null } : action === 'approve' || action === 'reject' ? { decision: action } : undefined;
      await api(`/admin/daily-questions/${encodeURIComponent(date)}${suffix}`, { method: action === 'save' ? 'PUT' : 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
      notify.success(t(action === 'save' ? '题目草稿已保存' : action === 'publish' ? '题目已发布' : action === 'generate' ? '总结草稿已生成' : action === 'approve' ? '总结已通过' : '总结不会公开'));
      await load(date);
    } catch (cause: any) { setError(cause.message || t('操作失败，请重试。')); }
    finally { setBusy(false); }
  }

  const isDraft = !question || question.status === 'draft';
  return <section id="daily-questions" className="settings-section daily-question-admin">
    <div className="settings-section-heading"><h2>{t('每日一问')}</h2><p>{t('提前写好题目并手动发布。回答与总结均需遵循北京时间。')}</p></div>
    <div className="daily-question-content">
      <div className="daily-question-note"><strong>{t('每天一题')}</strong><p>{t('09:00 开始接受回答，10:00 起向访客展示，23:00 截止。22:00 后可生成总结草稿。')}</p></div>
      <form className="daily-question-form" onSubmit={event => void perform('save', event)}>
        <div className="daily-question-form-heading"><h3>{question ? t('编辑当日题目') : t('新建题目')}</h3>{question && <span className="daily-question-badge">{t(statusLabels[question.status])}</span>}</div>
        <label className="settings-field daily-question-date"><span>{t('题目日期')}</span><input type="date" value={date} onChange={event => void chooseDate(event.target.value)} disabled={busy || loading} /></label>
        <label className="settings-field"><span className="daily-question-counter">{t('题目')}<small aria-hidden="true">{form.text.length} / 40</small></span><input value={form.text} maxLength={40} onChange={event => setForm(value => ({ ...value, text: event.target.value }))} disabled={busy || loading || !loaded || !isDraft} placeholder={t('例如：今天有什么值得记录的小事？')} /></label>
        <div className="daily-question-options"><div><strong>{t('回答选项')}</strong><p>{t('全部留空为开放回答；选择题请填写 2–4 个选项。')}</p></div>
          {form.choices.map((choice, index) => <div className="daily-question-option" key={index}><label className="settings-field"><span>{t('选项')} {index + 1}</span><input value={choice} maxLength={20} disabled={busy || loading || !loaded || !isDraft} onChange={event => setForm(value => ({ ...value, choices: value.choices.map((item, i) => i === index ? event.target.value : item) }))} /></label>{form.choices.length > 2 && isDraft && <AdminButton type="button" variant="ghost" size="icon" aria-label={`${t('删除选项')} ${index + 1}`} disabled={busy || loading || !loaded} onClick={() => setForm(value => ({ ...value, choices: value.choices.filter((_, i) => i !== index) }))}><Trash2 size={16} aria-hidden="true" /></AdminButton>}</div>)}
          {isDraft && form.choices.length < 4 && <AdminButton type="button" variant="soft" disabled={busy || loading || !loaded} onClick={() => setForm(value => ({ ...value, choices: [...value.choices, ''] }))}><Plus size={16} aria-hidden="true" />{t('添加选项')}</AdminButton>}
        </div>
        <div className="daily-question-actions">{isDraft && <><AdminButton type="submit" variant="solid" disabled={busy || loading || !loaded || !dirty}>{t('保存草稿')}</AdminButton><AdminButton type="button" variant="soft" disabled={busy || loading || !loaded || !question || dirty} onClick={() => void perform('publish')}>{t('发布题目')}</AdminButton></>}{question && <AdminButton type="button" variant="soft" disabled={busy || loading} onClick={() => void removeQuestion()}>{t('删除题目')}</AdminButton>}</div>
        {isDraft && dirty && <p className="daily-question-hint">{t('请先保存草稿，再发布。')}</p>}
      </form>
      {loaded && question && <section className="daily-question-summary"><div className="daily-question-form-heading"><h3>{t('总结审核')}</h3><span className="daily-question-badge">{t(summaryLabels[question.summary_status])}</span></div><p>{t('22:00 后可手动生成今日总结。审核仅决定是否公开总结，不影响题目。若截止前收到新回答，需重新生成并审核。')}</p>
        {question.draft_summary ? <div className="daily-question-summary-copy"><strong>{t('总结草稿')}</strong><p>{question.draft_summary}</p></div> : question.summary && question.summary_status === 'approved' ? <div className="daily-question-summary-copy"><strong>{t('已通过的总结')}</strong><p>{question.summary}</p></div> : <p>{t('尚无总结草稿。')}</p>}
        <div className="daily-question-actions"><AdminButton type="button" variant="soft" disabled={busy || loading || date > beijingDate() || question.status === 'draft'} onClick={() => void perform('generate')}>{t('生成总结')}</AdminButton>{(question.summary_status === 'pending' || question.summary_status === 'rejected') && <AdminButton type="button" variant="solid" disabled={busy || loading} onClick={() => void perform('approve')}>{t('公开总结')}</AdminButton>}{question.summary_status === 'pending' && <AdminButton type="button" variant="soft" disabled={busy || loading} onClick={() => void perform('reject')}>{t('暂不公开')}</AdminButton>}</div>
      </section>}
      <section className="daily-question-recent"><div className="daily-question-form-heading"><h3>{t('最近七天')}</h3><span>{t('选择日期查看')}</span></div>{loading ? <p role="status">{t('加载中…')}</p> : items.length ? <div className="daily-question-list">{items.map(item => <button type="button" key={item.id} className="daily-question-row" aria-current={item.question_date === date ? 'date' : undefined} onClick={() => void chooseDate(item.question_date)} disabled={busy}><span className="daily-question-row-main"><time>{item.question_date}</time><strong>{item.text}</strong></span><span className="daily-question-row-meta"><span>{t(statusLabels[item.status])}</span><span>{item.answer_count} {t('人回答')}</span><span>{t('总结')} · {t(summaryLabels[item.summary_status])}</span></span></button>)}</div> : <p className="daily-question-hint">{t('最近七天没有题目。')}</p>}</section>
      {error && <div className="daily-question-error" role="alert"><span>{error}</span>{!loaded && <AdminButton type="button" variant="soft" disabled={busy || loading} onClick={() => void load(date)}>{t('重试')}</AdminButton>}</div>}
    </div>
  </section>;
}
