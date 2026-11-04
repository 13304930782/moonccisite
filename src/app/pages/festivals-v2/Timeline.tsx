import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { dateOnly, shanghaiYear, timelinePosition, type Response, type Window as FestivalWindow } from './model';
import { layoutTimelineLabels } from './timelineLayout';
import '../../../styles/festival-timeline.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LANE_HEIGHT = 30;

export default function Timeline({ windows, data, error }: { windows: FestivalWindow[]; data: Response; error: string }) {
  const { t, locale } = useI18n();
  const english = locale === 'en';
  const descriptionId = useId();
  const canvas = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const [layout, setLayout] = useState<{ key: string; positions: ReturnType<typeof layoutTimelineLabels> }>();
  const year = shanghaiYear(data.state.serverTime);
  const start = Date.parse(`${year}-01-01T00:00:00+08:00`);
  const end = Date.parse(`${year + 1}-01-01T00:00:00+08:00`);
  const now = Math.max(0, Math.min(100, (Date.parse(data.state.serverTime) - start) / (end - start) * 100));
  const rows = windows.map(window => ({
    ...window,
    position: timelinePosition(window, year),
    name: t(data.catalog.find(item => item.id === window.id)?.name || window.id),
  })).filter(row => row.position).sort((a, b) => a.position!.left - b.position!.left);
  const measurementKey = JSON.stringify(rows.map(row => [row.id, row.name, row.position, row.id === data.state.active?.id]));

  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const width = element.clientWidth;
      const positions = layoutTimelineLabels(rows.map((row, index) => ({
        anchor: (row.position!.left + row.position!.width / 2) * width / 100,
        width: labels.current[index]?.getBoundingClientRect().width || 0,
      })), width);
      setLayout(previous => {
        const next = { key: measurementKey, positions };
        return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    labels.current.forEach(label => label && observer.observe(label));
    measure();
    void document.fonts.ready.then(measure);
    return () => { disposed = true; observer.disconnect(); };
    // Measurements depend on translated text, active weight, dates, and container size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurementKey]);

  const positions = layout?.key === measurementKey ? layout.positions : [];
  const lanes = Math.max(1, ...positions.map(position => position.lane + 1));
  const trackTop = lanes * LANE_HEIGHT + 12;
  return <div className="fv-year-timeline">
    <div className="fv-year-scroll" tabIndex={0} role="region" aria-label={english ? `${year} festival timeline` : `${year} 年节日时间轴`} aria-describedby={descriptionId}>
      <div className="fv-year-space">
        <div ref={canvas} className="fv-year-canvas" style={{ height: trackTop + 100 }} aria-hidden="true">
          {rows.map((row, index) => positions[index] && <span
            key={`guide-${row.id}-${row.start}`}
            className="fv-year-guide"
            style={{
              left: `${row.position!.left + row.position!.width / 2}%`,
              top: positions[index].lane * LANE_HEIGHT + 20,
              height: trackTop - positions[index].lane * LANE_HEIGHT - 20,
            }}
          />)}
          {rows.map((row, index) => <span
            key={`${row.id}-${row.start}`}
            ref={element => { labels.current[index] = element; }}
            className={`fv-year-label${row.id === data.state.active?.id ? ' is-active' : ''}`}
            style={{ left: positions[index]?.left || 0, top: (positions[index]?.lane || 0) * LANE_HEIGHT, visibility: positions[index] ? 'visible' : 'hidden' }}
          >{row.name}</span>)}
          <div className="fv-year-track" style={{ top: trackTop }}>
            {rows.map(row => <div key={`${row.id}-${row.start}`} className={`fv-year-window${row.id === data.state.active?.id ? ' is-active' : ''}`} style={{ left: `${row.position!.left}%`, width: `${row.position!.width}%` }} title={`${row.name}: ${dateOnly(row.start)} – ${dateOnly(new Date(Date.parse(row.end) - 1).toISOString())}`} />)}
            <div className="fv-year-today" style={{ left: `${now}%` }} />
          </div>
          <span className="fv-year-today-label" style={{ top: trackTop + 22, left: `clamp(24px, ${now}%, calc(100% - 24px))` }}>{english ? 'Today' : '今天'}</span>
          {MONTHS.map((month, index) => <span className="fv-year-month" key={month} style={{ top: trackTop + 62, left: `${(Date.parse(`${year}-${String(index + 1).padStart(2, '0')}-01T00:00:00+08:00`) - start) / (end - start) * 100}%` }}>{english ? month : `${index + 1}月`}</span>)}
        </div>
      </div>
    </div>
    <ul id={descriptionId} className="fv-sr-only">
      <li>{english ? 'Today' : '今天'}: {dateOnly(data.state.serverTime)}</li>
      {rows.map(row => <li key={`${row.id}-${row.start}`}>{row.name}: {dateOnly(row.start)} {english ? 'to' : '至'} {dateOnly(new Date(Date.parse(row.end) - 1).toISOString())}</li>)}
    </ul>
    {error && <p className="fv-year-error" role="status">{t(error)}</p>}
  </div>;
}
