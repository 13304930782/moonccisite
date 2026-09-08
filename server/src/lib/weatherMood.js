const TIMEZONE = 'Asia/Shanghai';
const MANUAL_MOODS = [
  ['00', '睡觉'],
  ['02', '放空'],
  ['03', '好奇'],
  ['04', '发呆'],
  ['10', '开心'],
  ['11', '疑惑'],
  ['12', '失落'],
  ['13', '惊讶'],
  ['14', '害羞'],
  ['15', '疲惫'],
  ['16', '专注'],
  ['17', '慌张'],
  ['18', '无奈'],
  ['19', '满意'],
  ['20', '困惑'],
  ['21', '生气'],
].map(([emotionId, name]) => ({ emotionId, name }));
function parseOverride(input, now = new Date()) {
  const mood = MANUAL_MOODS.find((item) => item.emotionId === input?.emotionId);
  const days = input?.durationDays ?? 1;
  if (!mood || !Number.isInteger(days) || days < 1 || days > 365) {
    throw Object.assign(
      new Error('请选择有效心情，持续天数须为 1～365 的整数。'),
      { status: 400 },
    );
  }
  return {
    ...mood,
    durationDays: days,
    startsAt: now.toISOString(),
    endsAt: new Date(now.getTime() + days * 86400000).toISOString(),
  };
}
function activeOverride(value, now = new Date()) {
  return value &&
    MANUAL_MOODS.some((item) => item.emotionId === value.emotionId) &&
    Date.parse(value.startsAt) <= now.getTime() &&
    Date.parse(value.endsAt) > now.getTime()
    ? value
    : null;
}
function applyOverride(snapshot, override, now = new Date()) {
  const active = activeOverride(override, now);
  const day = Math.floor(
    Date.parse(`${snapshot.date || businessDate(now)}T00:00:00Z`) / 86400000,
  );
  const groups = {
    10: ['10', '19', '03', '14'],
    19: ['19', '03', '02'],
    '02': ['02', '04'],
    '03': ['03', '11'],
    '04': ['04', '02', '15'],
    14: ['14', '10', '03'],
    13: ['13', '17'],
  };
  const choices = groups[snapshot.mood?.emotionId];
  const selected =
    choices &&
    MANUAL_MOODS.find(
      (item) => item.emotionId === choices[day % choices.length],
    );
  const weatherMood = selected
    ? { ...snapshot.mood, ...selected }
    : snapshot.mood;
  return {
    ...snapshot,
    mode: active ? 'manual' : 'weather',
    overrideEndsAt: active?.endsAt || null,
    mood: active
      ? {
          emotionId: active.emotionId,
          name: active.name,
          message: '这是 mooncci 今天的心情，陪你待一会儿。',
        }
      : weatherMood,
  };
}
const formatters = new Map();
function dateFormatter(timezone) {
  if (!formatters.has(timezone)) {
    if (formatters.size > 128) formatters.clear();
    formatters.set(
      timezone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    );
  }
  return formatters.get(timezone);
}
function businessDate(now = new Date(), timezone = TIMEZONE) {
  const parts = dateFormatter(timezone).formatToParts(now);
  return ['year', 'month', 'day']
    .map((key) => parts.find((part) => part.type === key).value)
    .join('-');
}
function nextDay(now = new Date(), timezone = TIMEZONE) {
  // Find the next local date boundary, including 23/25-hour daylight-saving days.
  const today = businessDate(now, timezone);
  let low = now.getTime(),
    high = low + 36 * 3600000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (businessDate(new Date(middle), timezone) === today) low = middle;
    else high = middle;
  }
  return new Date(high).toISOString();
}
function describeWeather(code) {
  if (code === 0 || code === 1)
    return {
      weather: code === 0 ? '晴' : '晴间多云',
      emotionId: '10',
      name: '开心',
      message: '晴朗的一天，心情也亮了一点。',
    };
  if (code === 2)
    return {
      weather: '多云',
      emotionId: '19',
      name: '惬意',
      message: '云朵慢慢走，今天也慢慢来。',
    };
  if (code === 3)
    return {
      weather: '阴',
      emotionId: '02',
      name: '放空',
      message: '今天有点阴，适合留一点时间发呆。',
    };
  if ([45, 48].includes(code))
    return {
      weather: '雾',
      emotionId: '03',
      name: '好奇',
      message: '雾里藏着什么？一起慢慢看。',
    };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return {
      weather: '雨',
      emotionId: '04',
      name: '安静',
      message: '听雨的日子，安静陪你一会儿。',
    };
  if ([71, 73, 75, 77, 85, 86].includes(code))
    return {
      weather: '雪',
      emotionId: '14',
      name: '雀跃',
      message: '今天有雪，偷偷开心一下。',
    };
  if ([95, 96, 99].includes(code))
    return {
      weather: '雷雨',
      emotionId: '13',
      name: '惊讶',
      message: '轰隆一声，陪你等雨停。',
    };
  return null;
}
function normalizeForecast(body, now, location) {
  const timezone = body?.timezone;
  if (typeof timezone !== 'string') throw new Error('WEATHER_INVALID_TIMEZONE');
  const date = businessDate(now, timezone),
    daily = body?.daily;
  const index = daily?.time?.indexOf(date) ?? -1;
  const code = index >= 0 ? daily.weather_code?.[index] : null;
  const mood = describeWeather(code);
  if (!mood) throw new Error('WEATHER_INVALID_FORECAST');
  const number = (value) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  return {
    status: 'ready',
    weatherSource: 'open-meteo',
    date,
    city: location,
    timezone,
    weather: {
      code,
      label: mood.weather,
      min: number(daily.temperature_2m_min?.[index]),
      max: number(daily.temperature_2m_max?.[index]),
    },
    mood: { emotionId: mood.emotionId, name: mood.name, message: mood.message },
    fetchedAt: now.toISOString(),
    refreshAt: nextDay(now, timezone),
  };
}
function unavailable(now, enabled = true, location = null) {
  return {
    status: !enabled ? 'disabled' : location ? 'unavailable' : 'needs_location',
    date: businessDate(now),
    city: location,
    timezone: TIMEZONE,
    weather: null,
    mood: null,
    fetchedAt: null,
    refreshAt: new Date(
      Math.min(now.getTime() + 15 * 60000, Date.parse(nextDay(now))),
    ).toISOString(),
  };
}
async function fetchForecast(now, location, fetchImpl = fetch) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '1',
  }).toString();
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(8000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('WEATHER_UPSTREAM_FAILED');
  return normalizeForecast(await response.json(), now, location);
}
module.exports = {
  MANUAL_MOODS,
  parseOverride,
  activeOverride,
  applyOverride,
  TIMEZONE,
  businessDate,
  nextDay,
  describeWeather,
  normalizeForecast,
  unavailable,
  fetchForecast,
};
