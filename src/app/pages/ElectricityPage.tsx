import '../../styles/electricity.css';
import '../../styles/elec-v2.css';
import { reducedMotion } from '../lib/motionPreference';
import { ThemeSelect } from '../components/ThemeSelect';
import { useAuth } from '../context/AuthContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { useSearchParams, Link } from 'react-router-dom';
import type { ElectricityRoom } from '../components/AdminElectricityRooms';
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { SiteBack } from '../components/SiteBack';
import { SiteFooter } from '../components/SiteFooter';
import { api } from '../lib/api';
import { ElectricityRssSubscription } from '../components/ElectricityRssSubscription';
import { observeElectricityReveals } from '../lib/electricityMotion';
import { daysProgress, depletionDate } from '../lib/electricityPresentation';
const ElectricityChart = lazy(() => import('../components/ElectricityChart'));

type Snapshot = {snapshotDate: string; recordedAt: string; todayUse: number | null; purchasedRemaining: number | null; subsidyRemaining: number | null; totalRemaining: number | null; price: number | null};
type Dashboard = {
  current: Snapshot | null; history: Snapshot[];
  dailyUsage?: {usageDate: string; usage: number | null; statusText: string; method: string}[];
  metrics: {averageDailyUse: number | null; estimatedDaysRemaining: number | null; usageSampleDays: number; forecastAt?: string};
  status: 'normal' | 'low' | 'critical' | 'unknown'; timezone: string;
};
const statusCopy = {
  normal: {label: '电量正常', detail: '余额处于安全范围'},
  low: {label: '自购电量偏低', detail: '建议关注后续消耗'},
  critical: {label: '需要尽快充值', detail: '总余量已经越过警戒线'},
  unknown: {label: '状态待确认', detail: '等待有效数据'},
};
function amount(value: number | null | undefined, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
}
function dateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + '+08:00');
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false}).format(date) : '—';
}
function useReducedMotion() {
  const [reduce, setReduce] = useState(() => reducedMotion());
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduce(reducedMotion());
    media.addEventListener('change', update); window.addEventListener('mooncci:motion-change', update);
    return () => {media.removeEventListener('change', update); window.removeEventListener('mooncci:motion-change', update);};
  }, []);
  return reduce;
}
function Balance({value, reduce}: {value: number | null | undefined; reduce: boolean}) {
  const started = useRef(false);
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {setDisplay(value); return;}
    if (started.current || reduce) {started.current = true; setDisplay(value); return;}
    started.current = true;
    let frame = 0; const start = performance.now(); setDisplay(0);
    const tick = (now: number) => {const t = Math.min(1, (now - start) / 900); setDisplay(value * (1 - (1 - t) ** 3)); if (t < 1) frame = requestAnimationFrame(tick);};
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduce]);
  return <><span aria-hidden="true">{amount(display)}</span><span className="sr-only">{amount(value)}</span></>;
}
function Segmented({label, options, value, onChange}: {label: string; options: {value: string; label: string}[]; value: string; onChange: (value: string) => void}) {
  const root = useRef<HTMLDivElement>(null), marker = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  useLayoutEffect(() => {
    const container = root.current, indicator = marker.current;
    if (!container || !indicator) return;
    const position = (animate: boolean) => {
      const selected = container.querySelector<HTMLButtonElement>('[aria-checked="true"]');
      if (!selected) return;
      const before = indicator.getBoundingClientRect(), bounds = container.getBoundingClientRect();
      (indicator.getAnimations?.() || []).forEach(animation => animation.cancel());
      const x = selected.offsetLeft, width = selected.offsetWidth;
      indicator.style.width = `${width}px`; indicator.style.transform = `translateX(${x}px)`;
      if (animate && !reduce && before.width && typeof indicator.animate === 'function') indicator.animate([
        {transform: `translateX(${before.left - bounds.left}px) scaleX(${before.width / width})`},
        {transform: `translateX(${x}px) scaleX(1)`},
      ], {duration: 320, easing: 'cubic-bezier(.22,1,.36,1)'});
    };
    position(true);
    let measuredWidth = container.clientWidth;
    const observer = new ResizeObserver(() => {if (container.clientWidth !== measuredWidth) {measuredWidth = container.clientWidth; position(false);}}); observer.observe(container);
    return () => observer.disconnect();
  }, [value, reduce]);
  return <div ref={root} className="elec-segment" role="radiogroup" aria-label={label}><span ref={marker} className="elec-segment-marker" aria-hidden="true"/>{options.map((option, index) => <button key={option.value} type="button" role="radio" aria-checked={option.value === value} tabIndex={option.value === value ? 0 : -1} onClick={() => {if (value !== option.value) onChange(option.value);}} onKeyDown={event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + options.length) % options.length;
    onChange(options[next].value); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  }}>{option.label}</button>)}</div>;
}
export default function ElectricityPage() {
  const {user, loading: authLoading} = useAuth();
  const {data: settings} = useSiteSettings();
  const [params, setParams] = useSearchParams();
  const [roomRetry, setRoomRetry] = useState(0);
  const [rooms, setRooms] = useState<ElectricityRoom[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {document.title = `宿舍电量监控 · ${settings?.brand?.site_title?.trim() || 'mooncci'}`;}, [settings?.brand?.site_title]);
  useEffect(() => {
    const controller = new AbortController(); setRooms([]); setError(''); setLoading(true);
    if (authLoading) return;
    if (!user) {setLoading(false); return;}
    api('/electricity/rooms', {cache: 'no-store', signal: controller.signal}).then(result => {if (!controller.signal.aborted) setRooms(result.data);}).catch(e => {if (!controller.signal.aborted) setError(e.message);}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [user?.id, authLoading, roomRetry]);
  const id = params.get('roomId') || rooms[0]?.id, room = rooms.find(r => r.id === id);
  const changeRoom = (roomId: string) => setParams(previous => {const next = new URLSearchParams(previous); next.set('roomId', roomId); return next;}, {replace: true});
  if (authLoading || loading || !user || !room) return <div className="neo-page"><Header/><main className="elec-v2" data-status="unknown"><div className="elec-top"><SiteBack className="elec-back"/><span>日常记录 · 电量</span></div><h1 className="elec-access-title">宿舍电量监控</h1>{authLoading || loading ? <div className="elec-skeleton" role="status">正在读取宿舍…</div> : !user ? <section className="elec-notice"><p>宿舍电量仅向已授权的登录用户开放。</p><Link className="elec-button elec-button-solid" to={`/login?redirect=${encodeURIComponent('/electricity' + (id ? '?roomId=' + id : ''))}`}>登录查看</Link></section> : <section className="elec-notice"><p role="status">{error || (!rooms.length ? '尚未绑定宿舍，请联系站长添加你的网站用户名。' : '没有这个宿舍的访问权限。')}</p>{error && <button type="button" className="elec-button" onClick={() => setRoomRetry(value => value + 1)}>重试</button>}{rooms.length > 0 && <button className="elec-button" onClick={() => changeRoom(rooms[0].id)}>查看我的宿舍</button>}</section>}</main><SiteFooter/></div>;
  return <ElectricityDashboard key={`${user.id}:${room.id}`} room={room} rooms={rooms} onRoomChange={changeRoom}/>;
}
function ElectricityDashboard({room, rooms, onRoomChange}: {room: ElectricityRoom; rooms: ElectricityRoom[]; onRoomChange: (id: string) => void}) {
  const [days, setDays] = useState(7), [chartMode, setChartMode] = useState<'balance' | 'usage'>('balance');
  const [tooltipTrigger, setTooltipTrigger] = useState<'hover' | 'click'>('hover');
  const reduceMotion = useReducedMotion();
  const revealRoot = useRef<HTMLElement>(null);
  const [data, setData] = useState<Dashboard | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api(`/electricity?days=${days}&roomId=${encodeURIComponent(room.id)}`, {cache: 'no-store', signal: controller.signal}).then(response => {if (!controller.signal.aborted) setData(response.data);}).catch(e => {if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '暂时无法读取电量数据。');}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [days, room.id, retry]);
  const schoolHistory = useMemo(() => (data?.dailyUsage || []).filter(item => item.method === 'school_daily').sort((a, b) => b.usageDate.localeCompare(a.usageDate)).slice(0, days), [data, days]);
  const chartData = useMemo(() => {
    const snapshots = new Map((data?.history || []).map(item => [item.snapshotDate, item]));
    const daily = new Map(schoolHistory.map(item => [item.usageDate, item]));
    return [...new Set([...snapshots.keys(), ...daily.keys()])].sort().slice(-days).map(date => ({date, total: snapshots.get(date)?.totalRemaining ?? null, recordedAt: snapshots.get(date)?.recordedAt, usage: daily.get(date)?.usage ?? null, usageStatus: daily.get(date)?.statusText || (date === data?.current?.snapshotDate ? '尚未结算' : '暂无数据')}));
  }, [data, days, schoolHistory]);
  const plotData = useMemo(() => chartMode === 'balance' ? chartData : [...schoolHistory].reverse().map(item => ({date: item.usageDate, usage: item.usage, usageStatus: item.statusText || '暂无数据', total: null})), [chartMode, chartData, schoolHistory]);
  useLayoutEffect(() => {
    if (revealRoot.current) return observeElectricityReveals(revealRoot.current, reduceMotion);
  }, [schoolHistory, plotData, reduceMotion]);
  const current = data?.current, state = statusCopy[data?.status || 'unknown'];
  const forecast = data?.metrics?.estimatedDaysRemaining, progress = daysProgress(forecast), endDate = depletionDate(current?.snapshotDate, forecast);
  const historyMax = Math.max(0, ...schoolHistory.map(item => typeof item.usage === 'number' && Number.isFinite(item.usage) ? item.usage : 0));
  const latestPoint = [...plotData].reverse().find(point => Number.isFinite(chartMode === 'balance' ? point.total : point.usage));
  return <div className="neo-page"><Header/><main ref={revealRoot} className="elec-v2" data-status={data?.status === 'normal' ? 'ok' : data?.status || 'unknown'} data-motion={reduceMotion ? 'reduced' : 'enabled'}>
    <div className="elec-top"><SiteBack className="elec-back"/><span>日常记录 · 电量</span></div>
    <section className="elec-heading"><div><h1>宿舍电量监控</h1><p>{room.name} · 记录宿舍电量与日常用电</p>{rooms.length > 1 && <label className="elec-room-choice"><span>切换宿舍</span><ThemeSelect aria-label="切换宿舍" value={room.id} onValueChange={onRoomChange}>{rooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</ThemeSelect></label>}</div><div className="status-pill"><span>{state.label}</span><small>{state.detail}</small></div></section>
    {error && <div className="elec-notice" role="alert"><p>{error}</p><button className="elec-button" onClick={() => setRetry(value => value + 1)}>重新读取</button></div>}
    <div className="elec-data" aria-busy={loading}>
    <section className={`elec-hero-card${loading && !data ? ' elec-loading' : ''}`} aria-label="当前电量">
      <div className="elec-balance"><span className="elec-label">总余量</span><div className="elec-balance-value"><strong><Balance value={current?.totalRemaining} reduce={reduceMotion}/></strong><span>kWh</span></div><p className="elec-updated">更新于 <time dateTime={current?.recordedAt}>{dateTime(current?.recordedAt)}</time></p></div>
      <div className="elec-forecast"><div className="elec-days"><span>预计还能用</span><div><strong>{amount(forecast, 1)}</strong><span>天</span></div></div><div className="days-track" role="progressbar" aria-label="预计可用天数" aria-valuemin={0} aria-valuemax={14} aria-valuenow={progress === null ? undefined : progress * 14} aria-valuetext={progress === null ? '暂无有效预测' : `${amount(forecast, 1)} 天`}><div className="days-fill" style={{width: `${(progress ?? 0) * 100}%`}}/></div><div className="elec-forecast-note">{amount(data?.metrics?.averageDailyUse) !== '—' && <span>按近 7 日均用 {amount(data?.metrics?.averageDailyUse)} kWh/天</span>}{endDate && <span>约 <time dateTime={endDate}>{Number(endDate.slice(5, 7))}月{Number(endDate.slice(8, 10))}日</time>用完</span>}</div></div>
    </section>
    <section className="elec-metrics" aria-label="电量明细">{[{label: '今日用电', value: current?.todayUse, unit: 'kWh', note: '截至采集时'}, {label: '自购剩余', value: current?.purchasedRemaining, unit: 'kWh'}, {label: '补贴剩余', value: current?.subsidyRemaining, unit: 'kWh'}, {label: '当前电价', value: current?.price, unit: '元/kWh'}].map(item => <article key={item.label} className={loading && !data ? 'elec-loading' : undefined}><span>{item.label}</span><div><strong>{amount(item.value)}</strong><small>{item.unit}</small></div><p>{item.note || '\u00a0'}</p></article>)}</section>
    <section className="elec-trend"><div className="elec-trend-head"><h2>趋势</h2><div className="elec-mode"><Segmented label="选择图表类型" value={chartMode} onChange={value => setChartMode(value as 'balance' | 'usage')} options={[{value: 'balance', label: '余额趋势'}, {value: 'usage', label: '日用电'}]}/></div><div className="elec-range"><Segmented label="选择历史范围" value={String(days)} onChange={value => setDays(Number(value))} options={[{value: '7', label: '7 天'}, {value: '30', label: '30 天'}]}/></div></div>
      <div className="elec-chart-card" data-elec-reveal="" data-visible={reduceMotion ? true : undefined}><div className="electricity-chart" data-days={days} data-chart-mode={chartMode} data-motion={reduceMotion ? 'reduced' : 'enabled'} role="img" aria-label={`近 ${days} 天${chartMode === 'balance' ? '余额趋势' : '日用电'}，最新 ${amount(latestPoint ? chartMode === 'balance' ? latestPoint.total : latestPoint.usage : null)} kWh`} onPointerDownCapture={event => setTooltipTrigger(event.pointerType === 'touch' ? 'click' : 'hover')} onPointerMoveCapture={event => {if (event.pointerType === 'mouse') setTooltipTrigger('hover');}}>{loading && !data ? <div className="elec-chart-empty" role="status">正在读取电量记录…</div> : !latestPoint ? <div className="elec-chart-empty">{chartMode === 'usage' ? '暂无学校历史用电记录' : '暂无余额趋势数据'}</div> : <Suspense fallback={<div className="elec-chart-empty" role="status">正在加载图表…</div>}><ElectricityChart key={`${chartMode}:${days}`} plotData={plotData} chartMode={chartMode} tooltipTrigger={tooltipTrigger} reduceMotion={reduceMotion}/></Suspense>}</div>
      <div className="elec-insights"><span>7 日平均用电 <strong>{amount(data?.metrics?.averageDailyUse)} kWh/天</strong></span><span>业务日期 <strong><time dateTime={current?.snapshotDate}>{current?.snapshotDate || '—'}</time></strong></span>{loading && data && <span role="status">正在更新…</span>}</div></div>
    </section>
    <section className="elec-history"><div className="elec-section-head"><h2>历史用电</h2><span>学校用电记录 · kWh</span></div>{schoolHistory.length ? <ul>{schoolHistory.map(item => <li key={item.usageDate} data-elec-reveal="" data-visible={reduceMotion ? true : undefined}><time dateTime={item.usageDate}>{item.usageDate}</time><span className="elec-history-track" aria-hidden="true"><span data-maximum={item.usage === historyMax} style={{transform: `scaleX(${historyMax && typeof item.usage === 'number' && Number.isFinite(item.usage) ? Math.max(0, item.usage) / historyMax : 0})`}}/></span><strong>{amount(item.usage)}</strong></li>)}</ul> : <p className="elec-empty">暂无历史记录</p>}</section>
    </div><ElectricityRssSubscription roomId={room.id}/>
  </main><SiteFooter/></div>;
}
