export type ChartSize = { width: number; height: number };

// ResizeObserver already has layout results. Never force a second layout by
// reading getBoundingClientRect when the chart mounts or its mode changes.
export function observeChartSize(
  element: HTMLElement,
  onSize: (size: ChartSize) => void,
) {
  let previous: ChartSize = { width: 0, height: 0 };
  let pending = previous;
  let frame: number | null = null;
  let disposed = false;
  const observer = new ResizeObserver((entries) => {
    if (disposed) return;
    const entry = entries.find((item) => item.target === element);
    if (!entry) return;
    pending = {
      width: Math.max(0, Math.round(entry.contentRect.width)),
      height: Math.max(0, Math.round(entry.contentRect.height)),
    };
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (disposed) return;
      if (
        pending.width === previous.width &&
        pending.height === previous.height
      )
        return;
      previous = pending;
      onSize(previous);
    });
  });
  observer.observe(element);
  return () => {
    disposed = true;
    observer.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
  };
}
