import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BatteryCharging, CalendarDays, RefreshCw, TrendingDown, Zap } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Header } from '../components/Header';
import { SiteFooter } from '../components/SiteFooter';
import { api } from '../lib/api';

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
  metrics: { averageDailyUse: number | null; estimatedDaysRemaining: number | null; balanceChange: number | null; usageSampleDays: number };
  status: 'normal' | 'low' | 'critical' | 'unknown';
  timezone: string;
};

const statusCopy = {
  normal: { label: '电量正常', detail: '余额处于安全范围', icon: BatteryCharging },
  low: { label: '自购电量偏低', detail: '建议关注后续消耗', icon: AlertTriangle },
  critical: { label: '需要尽快充值', detail: '总余量已经越过警戒线', icon: AlertTriangle },
  unknown: { label: '状态待确认', detail: '等待有效数据', icon: Activity },
};

function amount(value: number | null, digits = 2) {
  return value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

function dateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + '+08:00');
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

export default function ElectricityPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api(`/electricity?days=${days}`);
      setData(response.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '暂时无法读取电量数据。');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const chartData = useMemo(() => (data?.history || []).map((item) => ({
    date: item.snapshotDate.slice(5),
    total: item.totalRemaining,
    usage: item.todayUse,
  })), [data]);

  const state = statusCopy[data?.status || 'unknown'];
  const StateIcon = state.icon;
  const current = data?.current;

  return (
    <div className="electricity-page neo-page">
      <Header />
      <main className="electricity-main">
        <section className="electricity-hero">
          <div>
            <span className="electricity-kicker"><Zap aria-hidden="true" /> LIVE UTILITY</span>
            <h1>宿舍电量<br /><span>监控台</span></h1>
            <p>每日固定采集，追踪真实余量与消耗趋势。所有时间均按 Asia/Shanghai 计算。</p>
          </div>
          <div className={`electricity-status electricity-status--${data?.status || 'unknown'}`}>
            <StateIcon aria-hidden="true" />
            <div><strong>{state.label}</strong><span>{state.detail}</span></div>
          </div>
        </section>

        {loading ? (
          <section className="electricity-state" aria-live="polite">
            <RefreshCw className="electricity-spin" aria-hidden="true" />
            <h2>正在读取今日电量</h2><p>从安全的站内接口加载，不会在浏览器请求学校系统。</p>
          </section>
        ) : error ? (
          <section className="electricity-state electricity-state--error" role="alert">
            <AlertTriangle aria-hidden="true" /><h2>暂时没有连上监控</h2><p>{error}</p>
            <button type="button" className="electricity-button" onClick={load}>重新加载</button>
          </section>
        ) : !current ? (
          <section className="electricity-state">
            <CalendarDays aria-hidden="true" /><h2>第一份快照还在路上</h2><p>站长完成凭据配置并执行首次采集后，这里会显示真实数据。</p>
          </section>
        ) : (
          <>
            <section className="electricity-overview" aria-label="当前宿舍电量">
              <article className="electricity-total-card">
                <div className="electricity-card-label">TOTAL REMAINING / 总余量</div>
                <div className="electricity-total-value"><strong>{amount(current.totalRemaining)}</strong><span>kWh</span></div>
                <div className="electricity-total-foot">
                  <span>更新于 {dateTime(current.recordedAt)}</span>
                  <span>{data?.metrics.balanceChange === null ? '暂无昨日对比' : `较前次 ${data.metrics.balanceChange > 0 ? '+' : ''}${amount(data.metrics.balanceChange)} kWh`}</span>
                </div>
              </article>

              <div className="electricity-metric-grid">
                <article><span>今日用电</span><strong>{amount(current.todayUse)}</strong><small>kWh TODAY</small></article>
                <article><span>自购剩余</span><strong>{amount(current.purchasedRemaining)}</strong><small>PURCHASED</small></article>
                <article><span>补贴剩余</span><strong>{amount(current.subsidyRemaining)}</strong><small>SUBSIDY</small></article>
                <article><span>预计可用</span><strong>{data?.metrics.estimatedDaysRemaining === null ? '积累中' : amount(data.metrics.estimatedDaysRemaining, 1)}</strong><small>{data?.metrics.estimatedDaysRemaining === null ? `已有 ${data?.metrics.usageSampleDays || 0}/3 天` : 'DAYS LEFT'}</small></article>
              </div>
            </section>

            <section className="electricity-chart-card">
              <div className="electricity-section-head">
                <div><span>TREND / HISTORY</span><h2>余额与日用电趋势</h2></div>
                <div className="electricity-segment" aria-label="选择历史范围">
                  {[7, 30].map((value) => <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>{value} 天</button>)}
                </div>
              </div>
              {chartData.length < 2 ? (
                <div className="electricity-chart-empty">至少需要两天快照才能画出趋势；当前数据会继续保留。</div>
              ) : (
                <div className="electricity-chart" aria-label={`最近 ${days} 天电量趋势图`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                      <defs><linearGradient id="electricityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--electric-accent)" stopOpacity={0.8} /><stop offset="100%" stopColor="var(--electric-accent)" stopOpacity={0.05} /></linearGradient></defs>
                      <CartesianGrid stroke="var(--electric-grid)" strokeDasharray="4 5" vertical={false} />
                      <XAxis dataKey="date" stroke="var(--electric-muted)" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis stroke="var(--electric-muted)" tickLine={false} axisLine={false} fontSize={11} />
                      <Tooltip contentStyle={{ background: 'var(--electric-panel)', border: '2px solid var(--electric-border)', borderRadius: '10px', color: 'var(--electric-text)' }} />
                      <Area type="monotone" dataKey="total" name="总余量 kWh" stroke="var(--electric-line)" strokeWidth={3} fill="url(#electricityFill)" connectNulls />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="electricity-insights">
                <div><TrendingDown aria-hidden="true" /><span>7 日平均</span><strong>{amount(data?.metrics.averageDailyUse ?? null)} kWh/天</strong></div>
                <div><Zap aria-hidden="true" /><span>当前电价</span><strong>{amount(current.price)} 元/kWh</strong></div>
                <div><CalendarDays aria-hidden="true" /><span>业务日期</span><strong>{current.snapshotDate}</strong></div>
              </div>
            </section>

            <section className="electricity-history-list" aria-label="历史快照列表">
              <div className="electricity-section-head"><div><span>DAILY LEDGER</span><h2>每日快照</h2></div></div>
              <div className="electricity-table-scroll"><table><thead><tr><th>日期</th><th>今日用电</th><th>自购剩余</th><th>补贴剩余</th><th>总余量</th></tr></thead><tbody>
                {[...(data?.history || [])].reverse().map((item) => <tr key={item.snapshotDate}><td>{item.snapshotDate}</td><td>{amount(item.todayUse)} kWh</td><td>{amount(item.purchasedRemaining)}</td><td>{amount(item.subsidyRemaining)}</td><td><strong>{amount(item.totalRemaining)}</strong></td></tr>)}
              </tbody></table></div>
            </section>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
