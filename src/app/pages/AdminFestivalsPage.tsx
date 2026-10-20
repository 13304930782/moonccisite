import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ThemeSelect } from '../components/ThemeSelect';
import '../../styles/site-settings.css';
import '../../styles/festival-admin.css';

type Rule = { type: 'fixed' | 'lunar'; month: number; day: number; durationDays: number } | { type: 'floating'; kind: 'easter' | 'thanksgiving-us'; durationDays: number } | { type: 'annual'; kind: 'qingming'; durationDays: number };
type ModuleConfig = { enabled: boolean; level: 'major' | 'decoration' | 'easterEgg'; priority: number; rule: Rule; warmupDays: number; extensionDays: number; exceptions: Record<string, string | null>; options: Record<string, boolean> };
type Config = { mode: 'auto' | 'off' | 'manual'; manual: null | { id: string; expiresAt: string }; modules: Record<string, ModuleConfig> };
type Catalog = { id: string; name: string; implemented: boolean; options: { id: string; label: string }[]; coverage?: { from: number; to: number } | null };
type State = { active: null | { id: string }; reason: string; serverTime: string; nextCheckAt: string; modules: { id: string; status: string; reason: string; nextStart: string | null; nextReason?: string }[] };
type Response = { config: Config; catalog: Catalog[]; state: State };
const levels = { major: '大型主题', decoration: '局部装饰', easterEgg: '简单彩蛋' };
const shanghaiInput = (date: string) => new Date(new Date(date).getTime() + 8 * 3600000).toISOString().slice(0, 16);
const fromShanghai = (date: string) => date ? new Date(`${date}:00+08:00`).toISOString() : '';
const displayDate = (date: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="settings-field"><span>{label}</span>{children}</label>; }

export default function AdminFestivalsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Response | null>(null), [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [exceptionYears, setExceptionYears] = useState<Record<string, number>>({});
  const [previewId, setPreviewId] = useState('halloween'), [previewAt, setPreviewAt] = useState(() => shanghaiInput(new Date().toISOString()));
  async function load() { setError(''); try { const result: Response = await api('/settings/festivals'); setData(result); setConfig(result.config); } catch (e) { setError((e as Error).message); } }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setInterval(() => { void api('/settings/festivals', { signal: controller.signal, cache: 'no-store' }).then((result: Response) => setData(old => old ? { ...old, state: result.state } : old)).catch(() => {}); }, 30000);
    return () => { clearInterval(timer); controller.abort(); };
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { const result: Response = await api('/settings/festivals', { method: 'PUT', body: JSON.stringify(config) }); setData(result); setConfig(result.config); window.dispatchEvent(new Event('site-settings-updated')); window.dispatchEvent(new Event('mooncci:festivals-updated')); setMessage('已保存，访客页面将自动更新。'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function preview() {
    setBusy(true); setError('');
    try { await api('/settings/festivals/preview', { method: 'POST', readOnly: true, body: JSON.stringify({ festivalId: previewId, at: fromShanghai(previewAt) }) }); sessionStorage.setItem('mooncci-festival-preview', JSON.stringify({ festivalId: previewId, at: fromShanghai(previewAt), expiresAt: Date.now() + 1800000 })); window.dispatchEvent(new Event('mooncci:festival-preview')); navigate('/'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!data || !config) return <div className="site-settings-page"><h1 className="admin-title">节日管理</h1>{error ? <><p role="alert">{error}</p><button className="quiet-button" onClick={() => void load()}>重新加载</button></> : <p role="status">正在读取节日配置…</p>}</div>;
  const patch = (id: string, update: Partial<ModuleConfig>) => setConfig({ ...config, modules: { ...config.modules, [id]: { ...config.modules[id], ...update } } });
  const coverage = data.catalog.find(item => item.coverage)?.coverage;
  const coverageLabel = coverage ? `${coverage.from}–${coverage.to} 年` : '服务端当前支持年份';
  const activeName = data.catalog.find(item => item.id === data.state.active?.id)?.name;
  const changed = JSON.stringify(config) !== JSON.stringify(data.config);
  return <div className="site-settings-page festival-admin">
    <header className="settings-heading"><h1 className="admin-title">节日管理</h1></header>
    <p className="settings-hint">统一按上海时间排期；同时只展示一个主题。同优先级按模块 ID 排序，保持结果稳定。未开发的主题仅保留管理条目，不会覆盖可用主题。</p>
    <section className="festival-current" aria-label="当前生效情况"><strong>{activeName ? `当前：${activeName}` : '当前没有节日装饰'}</strong><p>{data.state.reason}</p><small>状态时间：{displayDate(data.state.serverTime)}（Asia/Shanghai）</small></section>
    <form onSubmit={save}>
      <section className="settings-section"><div className="settings-section-heading"><h2>全局模式</h2><p>手动指定必须有结束时间，到期恢复自动排期。</p></div><fieldset disabled={busy}>
        <Field label="展示方式"><ThemeSelect aria-label="展示方式" value={config.mode} onValueChange={mode => setConfig({ ...config, mode: mode as Config['mode'], manual: mode === 'manual' ? config.manual || { id: 'halloween', expiresAt: '' } : null })}><option value="auto">自动</option><option value="off">全部关闭</option><option value="manual">手动指定</option></ThemeSelect></Field>
        {config.mode === 'manual' && <div className="settings-two-columns"><Field label="指定主题"><select value={config.manual?.id || 'halloween'} onChange={e => setConfig({ ...config, manual: { id: e.target.value, expiresAt: config.manual?.expiresAt || '' } })}>{data.catalog.filter(item => item.implemented).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="失效时间（上海）"><input type="datetime-local" required value={config.manual?.expiresAt ? shanghaiInput(config.manual.expiresAt) : ''} onChange={e => setConfig({ ...config, manual: { id: config.manual?.id || 'halloween', expiresAt: fromShanghai(e.target.value) } })} /></Field></div>}
      </fieldset></section>
      <section aria-label="节日目录" className="festival-catalog">
        {data.catalog.map(item => {
          const exceptionYear = exceptionYears[item.id] ?? Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Shanghai' }).format(new Date()));
          const current = config.modules[item.id], status = data.state.modules.find(row => row.id === item.id);
          if (!current) return null;
          const levelAllows = (id: string) => current.level === 'major' || (current.level === 'decoration' ? id !== 'home' : ['header', 'favicon'].includes(id));
          const updateRule = (rule: Rule) => patch(item.id, { rule });
          return <details key={item.id} className="festival-module"><summary><strong>{item.name}</strong><span>{!item.implemented ? '主题尚未实现' : status?.reason || '状态待更新'}</span></summary>
            <p className="settings-hint">{status?.reason}{status?.nextStart ? ` · 下次日期命中：${displayDate(status.nextStart)}` : ` · ${status?.nextReason || '暂无可确定的下次日期'}`}</p>
            {!item.implemented && <p className="settings-hint">可以保存排期；视觉主题完成前不会实际展示。</p>}
            <fieldset disabled={busy}>
              <label className="festival-check"><input type="checkbox" checked={current.enabled} onChange={e => patch(item.id, { enabled: e.target.checked })} />启用排期</label>
              <div className="settings-two-columns"><Field label="展示等级"><select value={current.level} onChange={e => patch(item.id, { level: e.target.value as ModuleConfig['level'] })}>{Object.entries(levels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="优先级（数字越大越优先）"><input type="number" min={0} max={1000} required value={current.priority} onChange={e => patch(item.id, { priority: Number(e.target.value) })} /></Field></div>
              {item.implemented && <p className="settings-hint">大型主题保留全部已选效果；局部装饰隐藏首页大场景；简单彩蛋仅保留页头南瓜和 favicon。切换等级保留原选项，恢复等级后生效。</p>}
              <Field label="日期规则"><select value={current.rule.type} onChange={e => updateRule(e.target.value === 'annual' ? { type: 'annual', kind: 'qingming', durationDays: current.rule.durationDays } : e.target.value === 'floating' ? { type: 'floating', kind: 'easter', durationDays: current.rule.durationDays } : { type: e.target.value as 'fixed' | 'lunar', month: 1, day: 1, durationDays: current.rule.durationDays })}><option value="fixed">公历固定日期</option><option value="lunar">农历日期</option><option value="floating">浮动日期</option><option value="annual">清明年度日期表</option></select></Field>
              {current.rule.type === 'annual' ? <p className="settings-hint">清明按年度日期表计算，覆盖 {coverageLabel}；范围外不会猜测日期。</p> : current.rule.type === 'floating' ? <Field label="浮动规则及地区"><select value={current.rule.kind} onChange={e => updateRule({ ...current.rule, type: 'floating', kind: e.target.value as 'easter' | 'thanksgiving-us' })}><option value="easter">西方复活节（公历算法）</option><option value="thanksgiving-us">美国感恩节（11 月第 4 个星期四）</option></select></Field> : <div className="settings-two-columns"><Field label="月份"><input type="number" min={1} max={12} required value={current.rule.month} onChange={e => updateRule({ ...current.rule as Extract<Rule, { month: number }>, month: Number(e.target.value) })} /></Field><Field label="日期"><input type="number" min={1} max={current.rule.type === 'lunar' ? 30 : 31} required value={current.rule.day} onChange={e => updateRule({ ...current.rule as Extract<Rule, { day: number }>, day: Number(e.target.value) })} /></Field></div>}
              <div className="festival-three-columns">{(['durationDays', 'warmupDays', 'extensionDays'] as const).map((key, index) => <Field key={key} label={['持续天数', '提前预热天数', '结束延长天数'][index]}><input type="number" min={key === 'durationDays' ? 1 : 0} max={key === 'durationDays' ? 31 : 60} required value={key === 'durationDays' ? current.rule.durationDays : current[key]} onChange={e => key === 'durationDays' ? updateRule({ ...current.rule, durationDays: Number(e.target.value) }) : patch(item.id, { [key]: Number(e.target.value) })} /></Field>)}</div>
              {current.rule.type === 'lunar' && <p className="settings-hint">农历规则支持 {coverageLabel}的非闰月日期；超出覆盖年份会停止自动启用并显示原因。</p>}
              <div className="festival-exceptions"><h3>指定年份例外</h3><p className="settings-hint">覆盖该年的开始日期；选择“当年停用”则跳过该年。</p>{Object.entries(current.exceptions).map(([year, date]) => <div className="festival-exception" key={year}><span>{year} 年</span><input aria-label={`${item.name} ${year} 年开始日期`} type="date" min={`${year}-01-01`} max={`${year}-12-31`} required value={date || ''} disabled={date === null} onChange={e => patch(item.id, { exceptions: { ...current.exceptions, [year]: e.target.value } })} /><label className="festival-check"><input type="checkbox" checked={date === null} onChange={e => patch(item.id, { exceptions: { ...current.exceptions, [year]: e.target.checked ? null : `${year}-01-01` } })} />当年停用</label><button className="quiet-button" type="button" onClick={() => { const exceptions = { ...current.exceptions }; delete exceptions[year]; patch(item.id, { exceptions }); }}>移除</button></div>)}<div className="festival-exception"><Field label="例外年份"><input type="number" min={2025} max={2200} value={exceptionYear} onChange={e => setExceptionYears({ ...exceptionYears, [item.id]: Number(e.target.value) })} /></Field><button className="quiet-button" type="button" disabled={!Number.isInteger(exceptionYear) || exceptionYear < 2025 || exceptionYear > 2200 || String(exceptionYear) in current.exceptions} onClick={() => patch(item.id, { exceptions: { ...current.exceptions, [exceptionYear]: `${exceptionYear}-01-01` } })}>添加年份例外</button></div></div>
              {!!item.options.length && <div><h3>展示位置与效果</h3><div className="festival-options">{item.options.map(option => <label key={option.id} className="festival-check"><input type="checkbox" disabled={!levelAllows(option.id)} checked={current.options[option.id] !== false} onChange={e => patch(item.id, { options: { ...current.options, [option.id]: e.target.checked } })} />{option.label}{!levelAllows(option.id) && <small>当前等级不展示</small>}</label>)}</div></div>}
            </fieldset>
          </details>;
        })}
      </section>
      {error && <p role="alert" className="festival-error">{error}</p>}
      <div className="settings-save"><button className="button-primary" disabled={busy || !changed}>{busy ? '处理中…' : '保存节日设置'}</button><span role="status">{message}</span></div>
    </form>
    <section className="settings-section"><div className="settings-section-heading"><h2>仅此窗口预览</h2><p>使用已保存的效果设置，不修改线上配置。预览半小时后失效，可随时退出。</p></div><fieldset disabled={busy}><Field label="预览主题"><select value={previewId} onChange={e => setPreviewId(e.target.value)}>{data.catalog.filter(item => item.implemented).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="模拟时间（上海）"><input type="datetime-local" required value={previewAt} onChange={e => setPreviewAt(e.target.value)} /></Field><button className="quiet-button" type="button" disabled={!previewAt} onClick={() => void preview()}>打开页面预览</button></fieldset></section>
  </div>;
}
