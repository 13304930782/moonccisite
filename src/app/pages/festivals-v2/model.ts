export type Rule = { type: 'fixed' | 'lunar'; month: number; day: number; durationDays: number } | { type: 'floating'; kind: 'easter' | 'thanksgiving-us'; durationDays: number } | { type: 'annual'; kind: 'qingming'; durationDays: number };
export type ModuleConfig = { enabled: boolean; level: 'major' | 'decoration' | 'easterEgg'; priority: number; rule: Rule; warmupDays: number; extensionDays: number; exceptions: Record<string, string | null>; options: Record<string, boolean> };
export type Config = { mode: 'auto' | 'off' | 'manual'; manual: null | { id: string; expiresAt: string }; modules: Record<string, ModuleConfig> };
export type Catalog = { id: string; name: string; implemented: boolean; options: { id: string; label: string }[]; coverage?: { from: number; to: number } | null };
export type ModuleState = { id: string; status: string; windowLabel?: string; reason: string; nextStart: string | null; nextReason?: string };
export type State = { active: null | { id: string; label?: string; windowLabel?: string; level?: ModuleConfig['level']; options?: Record<string, boolean> }; reason: string; serverTime: string; nextCheckAt: string; modules: ModuleState[] };
export type Response = { config: Config; catalog: Catalog[]; state: State };
export type Window = { id: string; start: string; end: string };
export const levels = { major: '大型主题', decoration: '局部装饰', easterEgg: '简单彩蛋' };
const DAY = 86400000, OFFSET = 8 * 3600000;
const epoch = (date: string) => Date.parse(date);
export function shanghaiInput(date: string) {
  return Number.isFinite(epoch(date)) ? new Date(epoch(date) + OFFSET).toISOString().slice(0, 16) : '';
}
export function fromShanghai(date: string) {
  const parsed = date ? epoch(`${date.length === 16 ? `${date}:00` : date}+08:00`) : NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}
export function dateOnly(date: string) { return shanghaiInput(date).slice(0, 10).replaceAll('-', '/') || '—'; }
export function monthDay(date: string) {
  const input = shanghaiInput(date);
  return input ? `${input.slice(5, 7)}月${input.slice(8, 10)}日` : '—';
}
export function displayDate(date: string) { return shanghaiInput(date).replaceAll('-', '/').replace('T', ' ') || '—'; }
export function shanghaiYear(date: string) { return Number(shanghaiInput(date).slice(0, 4)) || NaN; }
function dayIndex(date: string) { return Math.floor((epoch(date) + OFFSET) / DAY); }
export function daysUntil(date: string, now: string) {
  const days = dayIndex(date) - dayIndex(now);
  return Number.isFinite(days) ? Math.max(0, days) : null;
}
export function daysRemaining(end: string, now: string) {
  if (!Number.isFinite(epoch(end)) || !Number.isFinite(epoch(now))) return null;
  return Math.max(0, Math.ceil((epoch(end) - epoch(now)) / DAY));
}
export function parseWindowLabel(label?: string): Omit<Window, 'id'> | null {
  const match = label?.match(/^(\d{4}-\d{2}-\d{2}) — (\d{4}-\d{2}-\d{2})$/);
  if (!match) return null;
  const start = epoch(`${match[1]}T00:00:00+08:00`), end = epoch(`${match[2]}T00:00:00+08:00`) + DAY;
  return Number.isFinite(start) && end > start ? { start: new Date(start).toISOString(), end: new Date(end).toISOString() } : null;
}
export function moduleWindow(id: string, start: string, module: ModuleConfig): Window | null {
  const length = module.rule.durationDays + module.warmupDays + module.extensionDays;
  if (!Number.isFinite(epoch(start)) || !Number.isFinite(length) || length <= 0) return null;
  return { id, start, end: new Date(epoch(start) + length * DAY).toISOString() };
}
export function timelinePosition(window: Pick<Window, 'start' | 'end'>, year: number) {
  const start = epoch(`${year}-01-01T00:00:00+08:00`), end = epoch(`${year + 1}-01-01T00:00:00+08:00`);
  const left = Math.max(start, epoch(window.start)), right = Math.min(end, epoch(window.end));
  if (![start, end, left, right].every(Number.isFinite) || right <= left) return null;
  return { left: (left - start) / (end - start) * 100, width: (right - left) / (end - start) * 100 };
}
export function ruleSummary(rule: Rule) {
  const date = rule.type === 'fixed' ? `${rule.month}月${rule.day}日` : rule.type === 'lunar' ? `农历${rule.month}月${rule.day}日` : rule.type === 'annual' ? '清明年度日期表' : rule.type === 'floating' && rule.kind === 'easter' ? '西方复活节' : '11月第4个星期四（美国）';
  return `${date} · 持续 ${rule.durationDays} 天`;
}
export function nextFestival(data: Response) {
  return data.state.modules.flatMap(row => {
    const item = data.catalog.find(item => item.id === row.id);
    return item && data.config.modules[row.id]?.enabled && row.nextStart && epoch(row.nextStart) > epoch(data.state.serverTime) ? [{ ...item, start: row.nextStart }] : [];
  }).sort((a, b) => epoch(a.start) - epoch(b.start) || a.id.localeCompare(b.id, 'en'))[0] || null;
}

// The existing authenticated preview is the calendar authority; the browser only places its windows.
export async function loadYearWindows(config: Config, year: number, preview: (config: Config, at: string) => Promise<State>): Promise<Window[]> {
  if (!Number.isInteger(year) || year < 2025 || year > 2200) throw new Error('年度时间轴支持 2025–2200 年');
  const yearStart = epoch(`${year}-01-01T00:00:00+08:00`), yearEnd = epoch(`${year + 1}-01-01T00:00:00+08:00`);
  const windows = new Map<string, Window>();
  let at = yearStart;
  // Each annual rule has at most three contributing occurrences, including both year edges.
  for (let count = 0; count <= Object.keys(config.modules).length * 3; count++) {
    const state = await preview(config, new Date(at).toISOString());
    let next = Infinity;
    for (const row of state.modules) {
      const module = config.modules[row.id];
      if (!module) continue;
      const current = parseWindowLabel(row.windowLabel);
      const upcoming = row.nextStart ? moduleWindow(row.id, row.nextStart, module) : null;
      for (const window of [current ? { id: row.id, ...current } : null, upcoming]) {
        if (window && timelinePosition(window, year)) windows.set(`${row.id}:${window.start}`, window);
      }
      if (row.nextStart && epoch(row.nextStart) > at && epoch(row.nextStart) < yearEnd) next = Math.min(next, epoch(row.nextStart));
    }
    if (!Number.isFinite(next)) return [...windows.values()].sort((a, b) => epoch(a.start) - epoch(b.start) || a.id.localeCompare(b.id, 'en'));
    at = next;
  }
  throw new Error('无法完整读取年度时间轴，请重试');
}
