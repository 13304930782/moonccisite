const BUSINESS_TIME_ZONE = 'Asia/Shanghai';
const SHANGHAI_OFFSET_HOURS = 8;

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function getShanghaiParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = Object.fromEntries(
    dateFormatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  );
  return parts;
}

function getBusinessDate(value = new Date()) {
  const { year, month, day } = getShanghaiParts(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getBusinessDateTime(value = new Date()) {
  const { year, month, day, hour, minute, second } = getShanghaiParts(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function hasReachedShanghaiHour(value = new Date(), hour = 21) {
  return getShanghaiParts(value).hour >= Number(hour);
}

function nextShanghaiHour(value = new Date(), hour = 21) {
  const now = value instanceof Date ? value : new Date(value);
  const { year, month, day } = getShanghaiParts(now);
  let target = new Date(Date.UTC(year, month - 1, day, Number(hour) - SHANGHAI_OFFSET_HOURS, 0, 0));
  if (target.getTime() <= now.getTime()) {
    target = new Date(target.getTime() + 24 * 60 * 60 * 1000);
  }
  return target;
}

module.exports = {
  BUSINESS_TIME_ZONE,
  getBusinessDate,
  getBusinessDateTime,
  getShanghaiParts,
  hasReachedShanghaiHour,
  nextShanghaiHour,
};
