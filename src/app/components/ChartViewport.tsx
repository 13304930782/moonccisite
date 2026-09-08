import { useEffect, useRef, useState, type ReactNode } from 'react';
import { observeChartSize, type ChartSize } from '../lib/observeChartSize';

export function ChartViewport({
  children,
}: {
  children: (size: ChartSize) => ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ChartSize>({ width: 0, height: 0 });
  useEffect(() => {
    if (container.current) return observeChartSize(container.current, setSize);
  }, []);
  return (
    <div
      ref={container}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 0,
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>
        {size.width > 0 && size.height > 0 ? children(size) : null}
      </div>
    </div>
  );
}
