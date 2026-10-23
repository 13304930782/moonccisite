import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Alert from '@radix-ui/react-alert-dialog';
import { Sheet, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { AlertDialog, AlertDialogTitle, AlertDialogDescription } from '../../components/ui/alert-dialog';
import FestivalSelect from './Select';
import type { Catalog, ModuleConfig, Rule } from './model';

const levels = { major: '大型主题', decoration: '局部装饰', easterEgg: '简单彩蛋' };
const dateText = (value: string | number) => new Intl.DateTimeFormat('zh-CN', {
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
    if (!validYear) { setExceptionError('年份应为 2025–2200 年。'); return; }
    if (exceptionMode === 'date' && (!exceptionDate.startsWith(`${year}-`) || Number.isNaN(Date.parse(`${exceptionDate}T00:00:00+08:00`)))) {
      setExceptionError('请选择该年份内的开始日期。'); return;
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
          <div><SheetTitle>{item.name}</SheetTitle>{!item.implemented && <span className="fv-pill">主题未实现</span>}</div>
          <button type="button" className="fv-icon-button" aria-label="关闭编辑排期" onClick={requestClose}>×</button>
          <SheetDescription className="fv-sr-only">编辑{item.name}排期。保存后需在页面保存节日设置，才会生效。</SheetDescription>
        </header>
        <form className="fv-drawer-form" onSubmit={save}>
          <div className="fv-drawer-body">
            {(!item.implemented || next) && <div className="fv-note">
              {!item.implemented && <p>可以保存排期；视觉主题完成前不会实际展示。</p>}
              {next && <p>下次命中：<time dateTime={next}>{dateText(next)}</time> – <time dateTime={new Date(nextEnd!).toISOString()}>{dateText(nextEnd!)}</time>（上海时间，当前已保存排期）</p>}
            </div>}
            <div className="fv-switch-row"><span>启用排期</span><FestivalSwitch label={`${item.name}启用排期`} checked={draft.enabled} onChange={enabled => patch({ enabled })} /></div>
            <div className="fv-grid-two">
              <Field label="展示等级"><FestivalSelect aria-label="展示等级" value={draft.level} onChange={event => patch({ level: event.target.value as ModuleConfig['level'] })}>
                {Object.entries(levels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </FestivalSelect></Field>
              <Field label="优先级（越大越优先）"><input type="number" required min={0} max={1000} value={draft.priority} onChange={event => patch({ priority: Number(event.target.value) })} /></Field>
            </div>
            {item.implemented && <p className="fv-muted">大型主题保留全部已选效果；局部装饰隐藏首页大场景；简单彩蛋仅保留页头南瓜和 favicon。切换等级会保留原选项。</p>}
            <Field label="日期规则"><FestivalSelect aria-label="日期规则" value={draft.rule.type} onChange={event => updateRule(event.target.value === 'annual'
              ? { type: 'annual', kind: 'qingming', durationDays: draft.rule.durationDays }
              : event.target.value === 'floating' ? { type: 'floating', kind: 'easter', durationDays: draft.rule.durationDays }
                : { type: event.target.value as 'fixed' | 'lunar', month: 1, day: 1, durationDays: draft.rule.durationDays })}>
              <option value="fixed">公历固定日期</option><option value="lunar">农历日期</option><option value="floating">浮动日期</option><option value="annual">清明年度日期表</option>
            </FestivalSelect></Field>
            {draft.rule.type === 'annual' ? <p className="fv-muted">清明按年度日期表计算，覆盖 {coverageLabel}；范围外不会猜测日期。</p>
              : draft.rule.type === 'floating' ? <Field label="浮动规则及地区"><FestivalSelect aria-label="浮动规则及地区" value={draft.rule.kind} onChange={event => updateRule({ type: 'floating', durationDays: draft.rule.durationDays, kind: event.target.value as 'easter' | 'thanksgiving-us' })}>
                <option value="easter">西方复活节（公历算法）</option><option value="thanksgiving-us">美国感恩节（11 月第 4 个星期四）</option>
              </FestivalSelect></Field>
                : <div className="fv-grid-two">
                  <Field label="月份"><input type="number" required min={1} max={12} value={draft.rule.month} onChange={event => updateRule({ ...draft.rule as Extract<Rule, { month: number }>, month: Number(event.target.value) })} /></Field>
                  <Field label="日期"><input type="number" required min={1} max={draft.rule.type === 'lunar' ? 30 : 31} value={draft.rule.day} onChange={event => updateRule({ ...draft.rule as Extract<Rule, { day: number }>, day: Number(event.target.value) })} /></Field>
                </div>}
            <div className="fv-grid-three">{(['durationDays', 'warmupDays', 'extensionDays'] as const).map((key, index) =>
              <Field key={key} label={['持续天数', '提前预热天数', '结束延长天数'][index]}>
                <input type="number" required min={key === 'durationDays' ? 1 : 0} max={key === 'durationDays' ? 31 : 60}
                  value={key === 'durationDays' ? draft.rule.durationDays : draft[key]}
                  onChange={event => key === 'durationDays' ? updateRule({ ...draft.rule, durationDays: Number(event.target.value) }) : patch({ [key]: Number(event.target.value) })} />
              </Field>)}</div>
            {draft.rule.type === 'lunar' && <p className="fv-muted">农历规则支持 {coverageLabel}的非闰月日期；超出覆盖年份会停止自动启用并显示原因。</p>}
            <section className="fv-exceptions" aria-label="指定年份例外">
              <h3>指定年份例外</h3><p className="fv-muted">覆盖该年的开始日期；选择“当年停用”则跳过该年。</p>
              <div className="fv-chips">{Object.entries(draft.exceptions).map(([exceptionYear, date]) =>
                <div className="fv-chip" key={exceptionYear}>
                  <button type="button" aria-label={`编辑 ${exceptionYear} 年例外`} onClick={() => { setYear(exceptionYear); setExceptionMode(date === null ? 'off' : 'date'); setExceptionDate(date || ''); setExceptionError(''); }}>
                    {exceptionYear} · {date === null ? '当年停用' : `改为 ${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`}
                  </button>
                  <button type="button" aria-label={`删除 ${exceptionYear} 年例外`} onClick={() => { const exceptions = { ...draft.exceptions }; delete exceptions[exceptionYear]; patch({ exceptions }); }}>×</button>
                </div>)}</div>
              <div className="fv-grid-two">
                <Field label="例外年份"><input type="number" min={2025} max={2200} value={year} onChange={event => { setYear(event.target.value); setExceptionDate(''); }} /></Field>
                <Field label="例外方式"><FestivalSelect aria-label="例外方式" value={exceptionMode} onChange={event => setExceptionMode(event.target.value as 'date' | 'off')}><option value="date">覆盖开始日期</option><option value="off">当年停用</option></FestivalSelect></Field>
              </div>
              {exceptionMode === 'date' && <Field label="例外开始日期"><input type="date" min={`${year}-01-01`} max={`${year}-12-31`} disabled={!validYear} value={exceptionDate} onChange={event => setExceptionDate(event.target.value)} /></Field>}
              {exceptionError && <p role="alert" className="fv-error">{exceptionError}</p>}
              <button type="button" className="fv-ghost" onClick={addException}>{existingYear ? '更新例外' : '添加例外'}</button>
            </section>
            {!!item.options.length && <section className="fv-options" aria-label="展示位置与效果">
              <h3>展示位置与效果</h3>{item.options.map(option => <label className="fv-option" key={option.id}>
                <input type="checkbox" disabled={!levelAllows(option.id)} checked={draft.options[option.id] !== false}
                  onChange={event => patch({ options: { ...draft.options, [option.id]: event.target.checked } })} />
                <span>{option.label}{!levelAllows(option.id) && <small className="fv-muted">当前等级不展示</small>}</span>
              </label>)}
            </section>}
          </div>
          <footer className="fv-drawer-foot"><button className="fv-ghost" type="button" onClick={requestClose}>取消</button><button className="fv-solid" type="submit">保存</button></footer>
        </form>
        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <Alert.Portal>
            <Alert.Overlay className="fest-v2 fv-overlay fv-confirm-overlay" />
            <Alert.Content className="fest-v2 fv-confirm" onEscapeKeyDown={event => { event.stopPropagation(); setConfirm(false); }}>
              <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
              <AlertDialogDescription>此节日在抽屉中的修改尚未保存。</AlertDialogDescription>
              <div className="fv-confirm-actions">
                <Alert.Cancel asChild><button className="fv-ghost" type="button">继续编辑</button></Alert.Cancel>
                <Alert.Action asChild><button className="fv-solid" type="button" onClick={onClose}>放弃修改</button></Alert.Action>
              </div>
            </Alert.Content>
          </Alert.Portal>
        </AlertDialog>
      </Dialog.Content>
    </Dialog.Portal>
  </Sheet>;
}
