import { useI18n } from '../../i18n';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Alert from '@radix-ui/react-alert-dialog';
import { Sheet, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { AlertDialog, AlertDialogTitle, AlertDialogDescription } from '../../components/ui/alert-dialog';
import FestivalSelect from './Select';
import type { Catalog, ModuleConfig, Rule } from './model';

const levels = { major: '大型主题', decoration: '局部装饰', easterEgg: '简单彩蛋' };
const dateText = (value: string | number, locale = 'zh-CN') => new Intl.DateTimeFormat(locale, {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(value));

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="fv-field"><span>{label}</span>{children}</label>;
}

export function FestivalSwitch({ checked, onChange, label }: { checked: boolean; onChange(value: boolean): void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="fv-switch"
    onClick={event => { event.stopPropagation(); onChange(!checked); }}><span aria-hidden="true" /></button>;
}

export default function Editor({ item, current, saved, status, coverageLabel, onSave, onClose, trigger }: {
  item: Catalog; current: ModuleConfig; saved?: ModuleConfig; status?: { nextStart: string | null; nextReason?: string };
  coverageLabel: string; onSave(value: ModuleConfig): void; onClose(): void; trigger?: HTMLElement | null;
}) {
  const { locale,  t } = useI18n();
  const [draft, setDraft] = useState<ModuleConfig>(() => structuredClone(current));
  const [confirm, setConfirm] = useState(false);
  const [year, setYear] = useState(() => new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Shanghai' }).format(new Date()));
  const [exceptionMode, setExceptionMode] = useState<'date' | 'off'>('date');
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionError, setExceptionError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(current);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const patch = (change: Partial<ModuleConfig>) => setDraft(old => ({ ...old, ...change }));
  const updateRule = (rule: Rule) => patch({ rule });
  const requestClose = () => dirty ? setConfirm(true) : onClose();
  const levelAllows = (id: string) => draft.level === 'major' || (draft.level === 'decoration' ? id !== 'home' : ['header', 'favicon'].includes(id));
  const validYear = /^\d{4}$/.test(year) && Number(year) >= 2025 && Number(year) <= 2200;
  const existingYear = Object.hasOwn(draft.exceptions, year);
  function addException() {
    if (!validYear) { setExceptionError(t("m_59b5cab87a")); return; }
    if (exceptionMode === 'date' && (!exceptionDate.startsWith(`${year}-`) || Number.isNaN(Date.parse(`${exceptionDate}T00:00:00+08:00`)))) {
      setExceptionError(t("m_e5af7eef60")); return;
    }
    patch({ exceptions: { ...draft.exceptions, [year]: exceptionMode === 'off' ? null : exceptionDate } });
    setExceptionError('');
    setExceptionDate('');
  }
  function save(event: FormEvent) { event.preventDefault(); onSave(draft); onClose(); }
  const next = status?.nextStart && Number.isFinite(Date.parse(status.nextStart)) ? status.nextStart : null;
  const savedConfig = saved || current;
  const nextEnd = next ? Date.parse(next) + (savedConfig.rule.durationDays + savedConfig.warmupDays + savedConfig.extensionDays) * 86400000 - 1 : null;
  return <Sheet open onOpenChange={open => { if (!open) requestClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fest-v2 fv-overlay" />
      <Dialog.Content className="fest-v2 fv-drawer"
        onCloseAutoFocus={event => { event.preventDefault(); trigger?.focus(); }}
        onEscapeKeyDown={event => { event.preventDefault(); if (!confirm) requestClose(); }}
        onPointerDownOutside={event => { event.preventDefault(); if (!confirm) requestClose(); }}
        onInteractOutside={event => event.preventDefault()}>
        <header className="fv-drawer-head">
          <div><SheetTitle>{item.name}</SheetTitle>{!item.implemented && <span className="fv-pill">{t("m_48a0eefb85")}</span>}</div>
          <button type="button" className="fv-icon-button" aria-label={t("m_7a00095652")} onClick={requestClose}>×</button>
          <SheetDescription className="fv-sr-only">{t("m_0518365699")}{item.name}{t("m_3c412c78fc")}</SheetDescription>
        </header>
        <form className="fv-drawer-form" onSubmit={save}>
          <div className="fv-drawer-body">
            {(!item.implemented || next) && <div className="fv-note">
              {!item.implemented && <p>{t("m_0ce46620e5")}</p>}
              {next && <p>{t("m_9a36a05d85")}<time dateTime={next}>{dateText(next,locale)}</time> – <time dateTime={new Date(nextEnd!).toISOString()}>{dateText(nextEnd!,locale)}</time>{t("m_142740e522")}</p>}
            </div>}
            <div className="fv-switch-row"><span>{t("m_1dd41e0ef8")}</span><FestivalSwitch label={t("m_a3089a8184", {v0: item.name})} checked={draft.enabled} onChange={enabled => patch({ enabled })} /></div>
            <div className="fv-grid-two">
              <Field label={t("m_08a94c1f4f")}><FestivalSelect aria-label={t("m_08a94c1f4f")} value={draft.level} onChange={event => patch({ level: event.target.value as ModuleConfig['level'] })}>
                {Object.entries(levels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
              </FestivalSelect></Field>
              <Field label={t("m_fff582e97f")}><input type="number" required min={0} max={1000} value={draft.priority} onChange={event => patch({ priority: Number(event.target.value) })} /></Field>
            </div>
            {item.implemented && <p className="fv-muted">{t("m_e9b4e994f5")}</p>}
            <Field label={t("m_03b5b088d2")}><FestivalSelect aria-label={t("m_03b5b088d2")} value={draft.rule.type} onChange={event => updateRule(event.target.value === 'annual'
              ? { type: 'annual', kind: 'qingming', durationDays: draft.rule.durationDays }
              : event.target.value === 'floating' ? { type: 'floating', kind: 'easter', durationDays: draft.rule.durationDays }
                : { type: event.target.value as 'fixed' | 'lunar', month: 1, day: 1, durationDays: draft.rule.durationDays })}>
              <option value="fixed">{t("m_bf15848573")}</option><option value="lunar">{t("m_1d9ff6a265")}</option><option value="floating">{t("m_8818e236e5")}</option><option value="annual">{t("m_9dc0615ee6")}</option>
            </FestivalSelect></Field>
            {draft.rule.type === 'annual' ? <p className="fv-muted">{t("m_00c84f094e")} {coverageLabel}{t("m_aa922fbbdf")}</p>
              : draft.rule.type === 'floating' ? <Field label={t("m_18b1ee43c3")}><FestivalSelect aria-label={t("m_18b1ee43c3")} value={draft.rule.kind} onChange={event => updateRule({ type: 'floating', durationDays: draft.rule.durationDays, kind: event.target.value as 'easter' | 'thanksgiving-us' })}>
                <option value="easter">{t("m_38aa60433d")}</option><option value="thanksgiving-us">{t("m_8866e8796a")}</option>
              </FestivalSelect></Field>
                : <div className="fv-grid-two">
                  <Field label={t("m_a27822d135")}><input type="number" required min={1} max={12} value={draft.rule.month} onChange={event => updateRule({ ...draft.rule as Extract<Rule, { month: number }>, month: Number(event.target.value) })} /></Field>
                  <Field label={t("m_70d0c1b336")}><input type="number" required min={1} max={draft.rule.type === 'lunar' ? 30 : 31} value={draft.rule.day} onChange={event => updateRule({ ...draft.rule as Extract<Rule, { day: number }>, day: Number(event.target.value) })} /></Field>
                </div>}
            <div className="fv-grid-three">{(['durationDays', 'warmupDays', 'extensionDays'] as const).map((key, index) =>
              <Field key={key} label={[t("m_8435f893fe"), t("m_9098667514"), t("m_52a6e97326")][index]}>
                <input type="number" required min={key === 'durationDays' ? 1 : 0} max={key === 'durationDays' ? 31 : 60}
                  value={key === 'durationDays' ? draft.rule.durationDays : draft[key]}
                  onChange={event => key === 'durationDays' ? updateRule({ ...draft.rule, durationDays: Number(event.target.value) }) : patch({ [key]: Number(event.target.value) })} />
              </Field>)}</div>
            {draft.rule.type === 'lunar' && <p className="fv-muted">{t("m_20507921f8")} {coverageLabel}{t("m_0218f9ff38")}</p>}
            <section className="fv-exceptions" aria-label={t("m_7d3061cad2")}>
              <h3>{t("m_7d3061cad2")}</h3><p className="fv-muted">{t("m_d7c5eb4736")}</p>
              <div className="fv-chips">{Object.entries(draft.exceptions).map(([exceptionYear, date]) =>
                <div className="fv-chip" key={exceptionYear}>
                  <button type="button" aria-label={t("m_d2ac9b0ba6", {v0: exceptionYear})} onClick={() => { setYear(exceptionYear); setExceptionMode(date === null ? 'off' : 'date'); setExceptionDate(date || ''); setExceptionError(''); }}>
                    {exceptionYear} · {date === null ? t("m_e9cdb07e74") : t("m_aaefb12a23", {v0: Number(date.slice(5, 7)), v1: Number(date.slice(8, 10))})}
                  </button>
                  <button type="button" aria-label={t("m_650162e150", {v0: exceptionYear})} onClick={() => { const exceptions = { ...draft.exceptions }; delete exceptions[exceptionYear]; patch({ exceptions }); }}>×</button>
                </div>)}</div>
              <div className="fv-grid-two">
                <Field label={t("m_249503898f")}><input type="number" min={2025} max={2200} value={year} onChange={event => { setYear(event.target.value); setExceptionDate(''); }} /></Field>
                <Field label={t("m_9e50ce3d5a")}><FestivalSelect aria-label={t("m_9e50ce3d5a")} value={exceptionMode} onChange={event => setExceptionMode(event.target.value as 'date' | 'off')}><option value="date">{t("m_ca5f8f9006")}</option><option value="off">{t("m_e9cdb07e74")}</option></FestivalSelect></Field>
              </div>
              {exceptionMode === 'date' && <Field label={t("m_7277aba08b")}><input type="date" min={`${year}-01-01`} max={`${year}-12-31`} disabled={!validYear} value={exceptionDate} onChange={event => setExceptionDate(event.target.value)} /></Field>}
              {exceptionError && <p role="alert" className="fv-error">{exceptionError}</p>}
              <button type="button" className="fv-ghost" onClick={addException}>{existingYear ? t("m_44344b905f") : t("m_79a43fd3f0")}</button>
            </section>
            {!!item.options.length && <section className="fv-options" aria-label={t("m_b893513e19")}>
              <h3>{t("m_b893513e19")}</h3>{item.options.map(option => <label className="fv-option" key={option.id}>
                <input type="checkbox" disabled={option.id === 'pageAccent' || !levelAllows(option.id)} checked={draft.options[option.id] !== false}
                  onChange={event => patch({ options: { ...draft.options, [option.id]: event.target.checked } })} />
                <span>{t(option.label)}{option.id === 'pageAccent' ? <small className="fv-muted">{t("m_033cc15c8e")}</small> : !levelAllows(option.id) && <small className="fv-muted">{t("m_bdbbe631ae")}</small>}</span>
              </label>)}
            </section>}
          </div>
          <footer className="fv-drawer-foot"><button className="fv-ghost" type="button" onClick={requestClose}>{t("m_2cd0f3be87")}</button><button className="fv-solid" type="submit">{t("m_a3030bf8f1")}</button></footer>
        </form>
        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <Alert.Portal>
            <Alert.Overlay className="fest-v2 fv-overlay fv-confirm-overlay" />
            <Alert.Content className="fest-v2 fv-confirm" onEscapeKeyDown={event => { event.stopPropagation(); setConfirm(false); }}>
              <AlertDialogTitle>{t("m_01aeaa37ee")}</AlertDialogTitle>
              <AlertDialogDescription>{t("m_eb43c999d1")}</AlertDialogDescription>
              <div className="fv-confirm-actions">
                <Alert.Cancel asChild><button className="fv-ghost" type="button">{t("m_fd4b9e3b6c")}</button></Alert.Cancel>
                <Alert.Action asChild><button className="fv-solid" type="button" onClick={onClose}>{t("m_9b7824cefa")}</button></Alert.Action>
              </div>
            </Alert.Content>
          </Alert.Portal>
        </AlertDialog>
      </Dialog.Content>
    </Dialog.Portal>
  </Sheet>;
}
