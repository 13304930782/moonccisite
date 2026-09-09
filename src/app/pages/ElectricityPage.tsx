import { ThemeSelect } from '../components/ThemeSelect';
import { useAuth } from '../context/AuthContext';
import { useSearchParams, Link } from 'react-router-dom';
import type { ElectricityRoom } from '../components/AdminElectricityRooms';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  CalendarDays,
  RefreshCw,
  TrendingDown,
  Zap,
} from 'lucide-react';
const ElectricityChart = lazy(() => import('../components/ElectricityChart'));
import { Header } from '../components/Header';
import { SiteFooter } from '../components/SiteFooter';
import { api } from '../lib/api';
import { ElectricityRssSubscription } from '../components/ElectricityRssSubscription';


type Snapshot = {
  snapshotDate: string;
  recordedAt: string;
  todayUse: number | null;
  purchasedRemaining: number | null;
  subsidyRemaining: number | null;
  totalRemaining: number | null;
  price: number | null;
};

type Dashboard = {
  current: Snapshot | null;
  history: Snapshot[];
  dailyUsage?: {
    usageDate: string;
    usage: number | null;
    statusText: string;
    method: string;
  }[];
  metrics: {
    forecastAt?: string;
    completedDayDate?: string;
    completedDayUse?: number | null;
    historyError?: string;
    averageDailyUse: number | null;
    estimatedDaysRemaining: number | null;
    balanceChange: number | null;
    usageSampleDays: number;
  };
  status: 'normal' | 'low' | 'critical' | 'unknown';
  timezone: string;
};

const statusCopy = {
  normal: {
    label: '电量正常',
    detail: '余额处于安全范围',
    icon: BatteryCharging,
  },
  low: {
    label: '自购电量偏低',
    detail: '建议关注后续消耗',
    icon: AlertTriangle,
  },
  critical: {
    label: '需要尽快充值',
    detail: '总余量已经越过警戒线',
    icon: AlertTriangle,
  },
  unknown: { label: '状态待确认', detail: '等待有效数据', icon: Activity },
};

function amount(value: number | null, digits = 2) {
  return value === null || !Number.isFinite(value)
    ? '—'
    : value.toFixed(digits);
}

function dateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(
    value.includes('T') ? value : value.replace(' ', 'T') + '+08:00',
  );
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
}

export default function ElectricityPage() {
  const { user, loading: authLoading } = useAuth();
  const [params, setParams] = useSearchParams();
  const [rooms, setRooms] = useState<ElectricityRoom[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setRooms([]);
    setError('');
    setLoading(true);
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    api('/electricity/rooms', { cache: 'no-store' })
      .then((result) => {
        if (!cancelled) setRooms(result.data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading]);
  const id = params.get('roomId') || rooms[0]?.id;
  const room = rooms.find((r) => r.id === id);
  if (authLoading || loading || !user || !room)
    return (
      <div className="electricity-page">
        <Header />
        <main className="site-container page-content electricity-access">
          <p className="eyebrow">日常记录 / 电量</p>
          <h1>宿舍电量监控</h1>
          {authLoading || loading ? (
            <p role="status">正在读取宿舍…</p>
          ) : !user ? (
            <>
              <p>宿舍电量仅向已授权的登录用户开放。</p>
              <Link
                className="electricity-button"
                to={`/login?redirect=${encodeURIComponent('/electricity' + (id ? '?roomId=' + id : ''))}`}
              >
                登录查看
              </Link>
            </>
          ) : (
            <>
              <p role="status">
                {error ||
                  (!rooms.length
                    ? '尚未绑定宿舍，请联系站长添加你的网站用户名。'
                    : '没有这个宿舍的访问权限。')}
              </p>
              {rooms.length > 0 && (
                <button
                  className="electricity-button"
                  onClick={() => setParams({ roomId: rooms[0].id })}
                >
                  查看我的宿舍
                </button>
              )}
            </>
          )}
        </main>
        <SiteFooter />
      </div>
    );
  return (
    <ElectricityDashboard
      key={`${user.id}:${room.id}`}
      room={room}
      rooms={rooms}
      onRoomChange={(id) => setParams({ roomId: id })}
    />
  );
}
function ElectricityDashboard({
  room,
  rooms,
  onRoomChange,
}: {
  room: ElectricityRoom;
  rooms: ElectricityRoom[];
  onRoomChange: (id: string) => void;
}) {
  const [days, setDays] = useState(7);
  const [chartMode, setChartMode] = useState<'balance' | 'usage'>('balance');
  const [tooltipTrigger, setTooltipTrigger] = useState<'hover' | 'click'>(
    'hover',
  );
  const [reduceMotion, setReduceMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api(
        `/electricity?days=${days}&roomId=${encodeURIComponent(room.id)}`,
        { cache: 'no-store' },
      );
      setData(response.data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : '暂时无法读取电量数据。',
      );
    } finally {
      setLoading(false);
    }
  }, [days, room.id]);

  useEffect(() => {
    load();
  }, [load]);

  const schoolHistory = useMemo(
    () =>
      (data?.dailyUsage || [])
        .filter((item) => item.method === 'school_daily')
        .sort((a, b) => b.usageDate.localeCompare(a.usageDate))
        .slice(0, days),
    [data, days],
  );

  const chartData = useMemo(() => {
    const snapshots = new Map(
      (data?.history || []).map((item) => [item.snapshotDate, item]),
    );
    const daily = new Map(schoolHistory.map((item) => [item.usageDate, item]));
    return [...new Set([...snapshots.keys(), ...daily.keys()])]
      .sort()
      .slice(-days)
      .map((date) => ({
        date,
        total: snapshots.get(date)?.totalRemaining ?? null,
        recordedAt: snapshots.get(date)?.recordedAt,
        usage: daily.get(date)?.usage ?? null,
        usageStatus:
          daily.get(date)?.statusText ||
          (date === data?.current?.snapshotDate ? '尚未结算' : '暂无数据'),
      }));
  }, [data, days, schoolHistory]);

  const plotData = useMemo(
    () =>
      chartMode === 'balance'
        ? chartData
        : [...schoolHistory].reverse().map((item) => ({
            date: item.usageDate,
            usage: item.usage,
            usageStatus: item.statusText || '暂无数据',
            total: null,
          })),
    [chartMode, chartData, schoolHistory],
  );
  const hasPlotData = plotData.some((point) =>
    Number.isFinite(chartMode === 'balance' ? point.total : point.usage),
  );

  const state = statusCopy[data?.status || 'unknown'];
  const StateIcon = state.icon;
  const current = data?.current;

  return (
    <div className="electricity-page neo-page">
      <Header />
      <main className="site-container page-content electricity-main">
        <section className="electricity-hero">
          <div>
            <p className="eyebrow">日常记录 / 电量</p>
            <h1>宿舍电量监控</h1>
            <p>{room.name} · 记录宿舍电量与日常用电。</p>
            {rooms.length > 1 && (
              <label className="electricity-room-choice">
                <span>切换宿舍</span>
                <ThemeSelect
                  aria-label="切换宿舍"
                  value={room.id}
                  onValueChange={onRoomChange}
                >
                  {rooms.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </ThemeSelect>
              </label>
            )}
          </div>
          <div
            className={`electricity-status electricity-status--${data?.status || 'unknown'}`}
          >
            <StateIcon aria-hidden="true" />
            <div>
              <strong>{state.label}</strong>
              <span>{state.detail}</span>
            </div>
          </div>
        </section>

        {loading && !data ? (
          <section className="electricity-state" aria-live="polite">
            <RefreshCw className="electricity-spin" aria-hidden="true" />
            <h2>正在读取今日电量</h2>
            <p>正在加载最近的电量记录。</p>
          </section>
        ) : error ? (
          <section
            className="electricity-state electricity-state--error"
            role="alert"
          >
            <AlertTriangle aria-hidden="true" />
            <h2>暂时没有连上监控</h2>
            <p>{error}</p>
            <button type="button" className="electricity-button" onClick={load}>
              重新加载
            </button>
          </section>
        ) : !current ? (
          <section className="electricity-state">
            <CalendarDays aria-hidden="true" />
            <h2>第一份快照还在路上</h2>
            <p>还没有可展示的电量记录，稍后再来看看。</p>
          </section>
        ) : (
          <>
            <section className="electricity-overview" aria-label="当前宿舍电量">
              <article className="electricity-total-card">
                <div className="electricity-card-label">
                  TOTAL REMAINING / 总余量
                </div>
                <div className="electricity-total-value">
                  <strong>{amount(current.totalRemaining)}</strong>
                  <span>kWh</span>
                </div>
                <div className="electricity-total-foot">
                  <span>更新于 {dateTime(current.recordedAt)}</span>
                </div>
              </article>

              <div className="electricity-metric-grid">
                <article>
                  <span>今日用电</span>
                  <strong>{amount(current.todayUse)}</strong>
                  <small>kWh · 截至采集时</small>
                </article>
                <article>
                  <span>自购剩余</span>
                  <strong>{amount(current.purchasedRemaining)}</strong>
                  <small>kWh</small>
                </article>
                <article>
                  <span>补贴剩余</span>
                  <strong>{amount(current.subsidyRemaining)}</strong>
                  <small>kWh</small>
                </article>
                <article>
                  <span>预计可用</span>
                  <strong>
                    {data?.metrics.estimatedDaysRemaining === null
                      ? '—'
                      : amount(data.metrics.estimatedDaysRemaining, 1)}
                  </strong>
                  <small>
                    {data?.metrics.estimatedDaysRemaining === null
                      ? '等待数据'
                      : '天'}
                  </small>
                </article>
              </div>
            </section>

            <section className="electricity-chart-card">
              <div className="electricity-section-head">
                <div>
                  <span>TREND / HISTORY</span>
                  <h2 className="sr-only">
                    {chartMode === 'balance' ? '余额趋势' : '日用电趋势'}
                  </h2>
                  <div
                    className="electricity-segment electricity-chart-modes"
                    role="group"
                    aria-label="选择图表类型"
                  >
                    <button
                      type="button"
                      aria-pressed={chartMode === 'balance'}
                      onClick={() => setChartMode('balance')}
                    >
                      余额趋势
                    </button>
                    <button
                      type="button"
                      aria-pressed={chartMode === 'usage'}
                      onClick={() => setChartMode('usage')}
                    >
                      日用电
                    </button>
                  </div>
                </div>
                <div className="electricity-segment" aria-label="选择历史范围">
                  {[7, 30].map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={days === value}
                      disabled={loading}
                      onClick={() => setDays(value)}
                    >
                      {value} 天
                    </button>
                  ))}
                </div>
              </div>
              {!hasPlotData ? (
                <div className="electricity-chart-empty">
                  {chartMode === 'usage'
                    ? '暂无学校历史用电记录'
                    : '暂无余额趋势数据'}
                </div>
              ) : (
                <div
                  className="electricity-chart"
                  data-days={days}
                  tabIndex={0}
                  aria-label={`最近 ${days} 天${chartMode === 'balance' ? '余额折线图' : '日用电柱状图'}`}
                  data-chart-mode={chartMode}
                  data-motion={reduceMotion ? 'reduced' : 'enabled'}
                  onPointerDownCapture={(event) => {
                    // Touch readers select a date by tapping; mouse readers use hover.
                    setTooltipTrigger(
                      event.pointerType === 'touch' ? 'click' : 'hover',
                    );
                  }}
                  onPointerMoveCapture={(event) => {
                    if (event.pointerType === 'mouse')
                      setTooltipTrigger('hover');
                  }}
                >
                  <Suspense fallback={<div className="electricity-chart-canvas" aria-label="正在加载图表" />}>
                    <ElectricityChart plotData={plotData} chartMode={chartMode} tooltipTrigger={tooltipTrigger} reduceMotion={reduceMotion} />
                  </Suspense>
                </div>
              )}
              <div className="electricity-insights">
                <div>
                  <TrendingDown aria-hidden="true" />
                  <span>7 日平均用电</span>
                  <strong>
                    {amount(data?.metrics.averageDailyUse ?? null)} kWh/天
                  </strong>
                </div>
                <div>
                  <Zap aria-hidden="true" />
                  <span>当前电价</span>
                  <strong>{amount(current.price)} 元/kWh</strong>
                </div>
                <div>
                  <CalendarDays aria-hidden="true" />
                  <span>业务日期</span>
                  <strong>{current.snapshotDate}</strong>
                </div>
              </div>
            </section>

            <section
              className="electricity-history-list"
              aria-label="学校历史用电"
            >
              <div className="electricity-section-head">
                <div>
                  <span>HISTORY</span>
                  <h2>历史用电</h2>
                </div>
                <p className="electricity-history-source">学校用电记录 · kWh</p>
              </div>
              {schoolHistory.length ? (
                <div className="electricity-school-history">
                  {schoolHistory.map((item) => (
                    <div
                      className="electricity-school-day"
                      key={item.usageDate}
                    >
                      <time dateTime={item.usageDate}>{item.usageDate}</time>
                      <span>
                        {item.usage === null ? '暂无数据' : amount(item.usage)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="electricity-history-empty">
                  暂无学校历史用电记录
                </p>
              )}
            </section>
          </>
        )}
        <ElectricityRssSubscription roomId={room.id} />
      </main>
      <SiteFooter />
    </div>
  );
}
