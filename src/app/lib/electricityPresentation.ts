/** Presentation only: forecasts and status thresholds remain server-owned. */
export function daysProgress(days: number | null | undefined) {
  return typeof days === 'number' && Number.isFinite(days) ? Math.min(1, Math.max(0, days) / 14) : null;
}

export function depletionDate(businessDate: string | undefined, days: number | null | undefined) {
  if (!businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate) || daysProgress(days) === null) return null;
  const date = new Date(`${businessDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== businessDate) return null;
  date.setUTCDate(date.getUTCDate() + Math.floor(Math.max(0, days!)));
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

export function maskedSubscription(url: string | null | undefined) {
  if (!url) return {before: '订阅链接尚未创建 ', mask: '••••••••••••••••', after: ''};
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.searchParams.has('token')) throw Error('Missing token');
    const match = /([?&]token=)([^&#]*)/.exec(url);
    if (!match) throw Error('Missing token');
    const start = match.index + match[1].length;
    return {before: url.slice(0, start), mask: '•'.repeat(match[2].length), after: url.slice(start + match[2].length)};
  } catch {
    return {before: '私密订阅链接 ', mask: '••••••••••••••••', after: ''};
  }
}
