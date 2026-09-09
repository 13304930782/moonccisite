import {
  Area,
  Bar,
  ComposedChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartViewport } from './ChartViewport';
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

function ElectricityChartTooltip({
  active,
  payload,
  mode,
}: {
  mode: 'balance' | 'usage';
  active?: boolean;
  payload?: readonly {
    payload?: {
      date: string;
      total: number | null;
      usage: number | null;
      usageStatus: string;
      recordedAt?: string;
    };
  }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="electricity-chart-tooltip">
      <strong>{point.date}</strong>
      {mode === 'balance' && (
        <>
          <p>总余量：{amount(point.total)} kWh</p>
          {point.recordedAt && (
            <small>余额采集于 {dateTime(point.recordedAt)}</small>
          )}
        </>
      )}
      <p>
        当日用电：
        {point.usage === null
          ? point.usageStatus
          : `${amount(point.usage)} kWh`}
      </p>
    </div>
  );
}

export default function ElectricityChart({ plotData, chartMode, tooltipTrigger, reduceMotion }: {
  plotData: { date: string; total: number | null; usage: number | null; usageStatus: string; recordedAt?: string }[];
  chartMode: 'balance' | 'usage'; tooltipTrigger: 'click' | 'hover'; reduceMotion: boolean;
}) { return (<div className="electricity-chart-canvas"><ChartViewport>
                    {({ width, height }) => (
                      <div key={chartMode} className="electricity-chart-enter">
                        <ComposedChart
                          width={width}
                          height={height}
                          accessibilityLayer
                          data={plotData}
                          margin={{ top: 12, right: 8, left: -18, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="electricityFill"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="var(--electric-accent)"
                                stopOpacity={0.8}
                              />
                              <stop
                                offset="100%"
                                stopColor="var(--electric-accent)"
                                stopOpacity={0.05}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            stroke="var(--electric-grid)"
                            strokeDasharray="4 5"
                            vertical={false}
                          />
                          <XAxis
                            tickFormatter={(value) => value.slice(5)}
                            dataKey="date"
                            stroke="var(--electric-muted)"
                            tickLine={false}
                            axisLine={false}
                            fontSize={12}
                          />
                          <YAxis
                            stroke="var(--electric-muted)"
                            tickLine={false}
                            axisLine={false}
                            fontSize={12}
                          />
                          <Tooltip
                            trigger={tooltipTrigger}
                            isAnimationActive={!reduceMotion}
                            animationDuration={150}
                            filterNull={false}
                            content={
                              <ElectricityChartTooltip mode={chartMode} />
                            }
                          />
                          {chartMode === 'balance' ? (
                            <Area
                              isAnimationActive={!reduceMotion}
                              animationBegin={0}
                              animationDuration={380}
                              animationEasing="ease-out"
                              type="monotone"
                              dataKey="total"
                              name="总余量 kWh"
                              stroke="var(--electric-line)"
                              strokeWidth={2}
                              fill="url(#electricityFill)"
                              dot={plotData.length === 1}
                            />
                          ) : (
                            <Bar
                              isAnimationActive={!reduceMotion}
                              animationBegin={0}
                              animationDuration={380}
                              animationEasing="ease-out"
                              dataKey="usage"
                              name="日用电 kWh"
                              fill="var(--electric-line)"
                              fillOpacity={0.8}
                              maxBarSize={36}
                              radius={[3, 3, 0, 0]}
                            />
                          )}
                        </ComposedChart>
                      </div>
                    )}
                  </ChartViewport></div>); }
