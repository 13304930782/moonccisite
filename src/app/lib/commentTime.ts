const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** ISO timestamps describe an instant; legacy unzoned dates use the site's Beijing time. */
export function formatCommentTime(value: string | null | undefined, includeTime = false): string {
  if (!value?.trim()) return '-';
  let text = value.trim();
  const unzoned = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)?$/.test(text);
  if (unzoned) {
    text = text.length === 10 ? text + 'T00:00:00+08:00' : text.replace(' ', 'T') + '+08:00';
  }
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return '-';
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return includeTime ? `${day} ${parts.hour}:${parts.minute}:${parts.second}` : day;
}
