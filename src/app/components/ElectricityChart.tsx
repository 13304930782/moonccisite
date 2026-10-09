import { useId, useState } from 'react';
import { area, line, curveMonotoneX } from 'd3-shape';
import { ChartViewport } from './ChartViewport';
function amount(value: number | null, digits = 2) {
  return value === null || !Number.isFinite(value)
    ? '—'
    : value.toFixed(digits);
}

type Point = { date: string; total: number | null; usage: number | null; usageStatus: string; recordedAt?: string };
type Props = { plotData: Point[]; chartMode: 'balance' | 'usage'; tooltipTrigger: 'click' | 'hover'; reduceMotion: boolean };

export function Plot({plotData, chartMode, tooltipTrigger, reduceMotion, width, height}: Props & {width: number; height: number}) {
  const gradient = useId().replace(/:/g, '');
  const [selected, setSelected] = useState<number | null>(null);
  const left = 42, right = width - 8, top = 12, bottom = Math.max(13, height - 30);
  const value = (p: Point) => chartMode === 'balance' ? p.total : p.usage;
  const valid = (p: Point) => value(p) !== null && Number.isFinite(value(p));
  const values = plotData.filter(valid).map(p => value(p)!);
  const minimum = Math.min(0, ...values), maximum = Math.max(0, ...values);
  const span = maximum - minimum || 1;
  const power = 10 ** Math.floor(Math.log10(span / 4));
  const ratio = span / 4 / power;
  const step = (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * power;
  const low = Math.floor(minimum / step) * step;
  const high = maximum === minimum ? low + step * 4 : Math.ceil(maximum / step) * step;
  const y = (v: number) => bottom - (v - low) / (high - low) * (bottom - top);
  const space = (right - left) / Math.max(1, chartMode === 'usage' ? plotData.length : plotData.length - 1);
  const x = (i: number) => plotData.length === 1 ? (left + right) / 2 : left + space * (chartMode === 'usage' ? i + .5 : i);
  const ticks = Array.from({length: Math.round((high - low) / step) + 1}, (_, i) => low + i * step);
  const curve = line<Point>().defined(valid).x((_, i) => x(i)).y(p => y(value(p)!)).curve(curveMonotoneX);
  const fill = area<Point>().defined(valid).x((_, i) => x(i)).y0(y(0)).y1(p => y(value(p)!)).curve(curveMonotoneX);
  const point = selected === null ? undefined : plotData[selected];
  const selectAt = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!plotData.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const position = (event.clientX - rect.left) * width / rect.width;
    const index = plotData.length === 1 ? 0 : Math.round((position - left) / space - (chartMode === 'usage' ? .5 : 0));
    setSelected(Math.max(0, Math.min(plotData.length - 1, index)));
  };
  const tickEvery = Math.max(1, Math.ceil(plotData.length / Math.max(2, Math.floor((right - left) / 75))));
  return <div className="electricity-chart-enter" style={{position: 'relative', width, height, animation: reduceMotion ? 'none' : undefined}}>
    <svg width={width} height={height} role="application" tabIndex={0}
      aria-label={`${chartMode === 'balance' ? '总余量' : '日用电'}图表。左右方向键选择日期，Escape 关闭详情。`}
      onKeyDown={event => {
        if (event.key === 'Escape') { setSelected(null); return; }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !plotData.length) return;
        event.preventDefault();
        setSelected(index => event.key === 'Home' ? 0 : event.key === 'End' ? plotData.length - 1 : Math.max(0, Math.min(plotData.length - 1, (index ?? (event.key === 'ArrowRight' ? -1 : plotData.length)) + (event.key === 'ArrowRight' ? 1 : -1))));
      }}
      onPointerMove={event => { if (tooltipTrigger === 'hover' && event.pointerType !== 'touch') selectAt(event); }}
      onPointerLeave={() => { if (tooltipTrigger === 'hover') setSelected(null); }} onClick={selectAt}>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--electric-accent)" stopOpacity={.8}/><stop offset="100%" stopColor="var(--electric-accent)" stopOpacity={.05}/></linearGradient></defs>
      {ticks.map(v => <g key={v}><line x1={left} x2={right} y1={y(v)} y2={y(v)} stroke="var(--electric-grid)" strokeDasharray="4 5"/><text x={left - 8} y={y(v)} dy=".35em" textAnchor="end" fill="var(--electric-muted)" fontSize={12}>{Number(v.toPrecision(6))}</text></g>)}
      {plotData.map((p, i) => i % tickEvery === 0 || i === plotData.length - 1 ? <text key={p.date} x={x(i)} y={height - 8} textAnchor={i === plotData.length - 1 && plotData.length > 1 ? 'end' : 'middle'} fill="var(--electric-muted)" fontSize={12}>{p.date.slice(5)}</text> : null)}
      {chartMode === 'balance' ? <><path d={fill(plotData) || undefined} fill={`url(#${gradient})`}/><path d={curve(plotData) || undefined} fill="none" stroke="var(--electric-line)" strokeWidth={2}/>{plotData.map((p, i) => valid(p) && (plotData.length === 1 || (i === 0 || !valid(plotData[i - 1])) && (i === plotData.length - 1 || !valid(plotData[i + 1]))) ? <circle key={p.date} cx={x(i)} cy={y(value(p)!)} r={3} fill="var(--electric-line)"/> : null)}</> : plotData.map((p, i) => valid(p) ? <rect key={p.date} x={x(i) - Math.min(36, space * .7) / 2} y={Math.min(y(0), y(value(p)!))} width={Math.min(36, space * .7)} height={Math.abs(y(value(p)!) - y(0))} rx={3} fill="var(--electric-line)" fillOpacity={.8}/> : null)}
      {point && selected !== null && <g pointerEvents="none"><line x1={x(selected)} x2={x(selected)} y1={top} y2={bottom} stroke="var(--electric-muted)" strokeDasharray="3 3"/>{valid(point) && <circle cx={x(selected)} cy={y(value(point)!)} r={4} fill="var(--electric-line)"/>}</g>}
    </svg>
    {point && selected !== null && <div role="status" style={{position: 'absolute', pointerEvents: 'none', top: 18, left: Math.max(0, Math.min(width - Math.min(280, width), x(selected) + 12))}}><ElectricityChartTooltip active mode={chartMode} payload={[{payload:point}]}/></div>}
  </div>;
}

export default function ElectricityChart(props: Props) {
  return <div className="electricity-chart-canvas"><ChartViewport>{size => <Plot key={props.chartMode} {...props} {...size}/>}</ChartViewport></div>;
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

