import { useId, useState } from 'react';
import { area, line, curveMonotoneX } from 'd3-shape';
import { ChartViewport } from './ChartViewport';
function amount(value: number | null, digits = 2) {
  return value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}
type Point = { date: string; total: number | null; usage: number | null; usageStatus: string; recordedAt?: string };
type Props = { plotData: Point[]; chartMode: 'balance' | 'usage'; tooltipTrigger: 'click' | 'hover'; reduceMotion: boolean };

export function Plot({plotData, chartMode, tooltipTrigger, reduceMotion, width, height}: Props & {width: number; height: number}) {
  const id = useId().replace(/:/g, '');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const left = 42, right = Math.max(left + 1, width - 8), top = 12, bottom = Math.max(13, height - 30);
  const value = (p: Point) => chartMode === 'balance' ? p.total : p.usage;
  const valid = (p: Point) => value(p) !== null && Number.isFinite(value(p));
  const values = plotData.filter(valid).map(p => value(p)!);
  const minimum = Math.min(0, ...values), maximum = Math.max(0, ...values), peak = Math.max(...values);
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
  const latest = plotData.reduce((last, p, i) => valid(p) ? i : last, -1);
  const selected = selectedDate === null ? -1 : plotData.findIndex(p => p.date === selectedDate);
  const active = selected >= 0 ? selected : latest;
  const point = plotData[active];
  const label = point ? `${point.date.slice(5)} · ${valid(point) ? amount(value(point)) + ' kWh' : chartMode === 'usage' ? point.usageStatus || '暂无数据' : '暂无数据'}` : '';
  const labelWidth = Math.min(Math.max(116, label.length * 7 + 20), Math.max(1, width - 16));
  const pointY = point && valid(point) ? y(value(point)!) : bottom;
  const selectAt = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!plotData.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const position = (event.clientX - rect.left) * width / rect.width;
    const index = plotData.length === 1 ? 0 : Math.round((position - left) / space - (chartMode === 'usage' ? .5 : 0));
    setSelectedDate(plotData[Math.max(0, Math.min(plotData.length - 1, index))].date);
  };
  const tickEvery = Math.max(1, Math.ceil(plotData.length / Math.max(2, Math.floor((right - left) / 75))));
  return <div className="elec-v2Chart-plot" data-motion={reduceMotion ? "reduced" : "enabled"} style={{position: 'relative', width, height, animation: reduceMotion ? 'none' : undefined}}>
    <svg width={width} height={height} role="application" tabIndex={0} aria-describedby={point ? `${id}-label` : undefined}
      aria-label={`${chartMode === 'balance' ? '总余量' : '日用电'}图表。左右方向键选择日期，Escape 恢复最新日期。`}
      onKeyDown={event => {
        if (event.key === 'Escape') { setSelectedDate(null); return; }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !plotData.length) return;
        event.preventDefault();
        const current = selected >= 0 ? selected : event.key === 'ArrowRight' ? -1 : plotData.length;
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? plotData.length - 1 : Math.max(0, Math.min(plotData.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1)));
        setSelectedDate(plotData[index].date);
      }}
      onPointerMove={event => { if (tooltipTrigger === 'hover' && event.pointerType !== 'touch') selectAt(event); }}
      onPointerLeave={() => { if (tooltipTrigger === 'hover') setSelectedDate(null); }} onClick={selectAt}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--foreground)" stopOpacity={.12}/><stop offset="100%" stopColor="var(--foreground)" stopOpacity={0}/></linearGradient><clipPath id={`${id}-reveal`}><rect className="elec-curve-reveal" x={left - 4} y={0} width={right - left + 8} height={height} style={{transformOrigin: `${left - 4}px 0px`}}/></clipPath></defs>
      {ticks.map(v => <g key={v}><line x1={left} x2={right} y1={y(v)} y2={y(v)} stroke="var(--foreground)" strokeOpacity={.07} strokeDasharray="2 5"/><text x={left - 8} y={y(v)} dy=".35em" textAnchor="end" fill="var(--muted-foreground)" fontSize={12}>{Number(v.toPrecision(6))}</text></g>)}
      {plotData.map((p, i) => i % tickEvery === 0 || i === plotData.length - 1 ? <text key={p.date} x={x(i)} y={height - 8} textAnchor={i === plotData.length - 1 && plotData.length > 1 ? 'end' : 'middle'} fill="var(--muted-foreground)" fontSize={12}>{p.date.slice(5)}</text> : null)}
      {chartMode === 'balance' ? <g clipPath={`url(#${id}-reveal)`}><path d={fill(plotData) || undefined} fill={`url(#${id})`}/><path d={curve(plotData) || undefined} fill="none" stroke="var(--foreground)" strokeWidth={2.5}/>{plotData.map((p, i) => valid(p) && (i === latest || plotData.length === 1 || (i === 0 || !valid(plotData[i - 1])) && (i === plotData.length - 1 || !valid(plotData[i + 1]))) ? <circle key={p.date} className={i === latest ? 'elec-v2Chart-latest' : undefined} cx={x(i)} cy={y(value(p)!)} r={3.5} fill="var(--foreground)"/> : null)}</g> : plotData.map((p, i) => valid(p) ? <rect key={p.date} className="elec-usage-bar" style={{transformOrigin: `0px ${y(0)}px`}} x={x(i) - Math.min(36, space * .7) / 2} y={Math.min(y(0), y(value(p)!))} width={Math.min(36, space * .7)} height={Math.abs(y(value(p)!) - y(0))} rx={4} fill={value(p) === peak ? 'var(--foreground)' : 'var(--muted-foreground)'} fillOpacity={value(p) === peak ? 1 : .55}/> : null)}
      {chartMode === 'usage' && latest >= 0 && <circle className="elec-v2Chart-latest" cx={x(latest)} cy={y(value(plotData[latest])!)} r={3.5} fill="var(--foreground)"/>}
      {selected >= 0 && point && <g pointerEvents="none"><line x1={x(selected)} x2={x(selected)} y1={top} y2={bottom} stroke="var(--muted-foreground)" strokeOpacity={.35} strokeDasharray="2 5"/>{valid(point) && <circle cx={x(selected)} cy={pointY} r={4} fill="var(--foreground)"/>}</g>}
    </svg>
    {point && <div id={`${id}-label`} className="elec-v2Chart-tooltip" role={selected >= 0 ? 'status' : undefined} title={point.recordedAt ? `余额采集于 ${point.recordedAt}` : undefined} style={{position: 'absolute', pointerEvents: 'none', width: labelWidth, maxWidth: 'calc(100% - 16px)', left: Math.max(8, Math.min(width - labelWidth - 8, x(active) - labelWidth / 2)), top: Math.max(0, Math.min(height - 36, pointY < 48 ? pointY + 12 : pointY - 40))}}>{label}</div>}
  </div>;
}
export default function ElectricityChart(props: Props) {
  return <div className="electricity-chart-canvas elec-v2Chart"><ChartViewport>{size => <Plot key={props.chartMode} {...props} {...size}/>}</ChartViewport></div>;
}

