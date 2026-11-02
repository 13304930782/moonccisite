const DAY = 86400000;
const coverage = { from: 2025, to: 2035 };
const fixed = (month, day, durationDays = 1) => ({ type: 'fixed', month, day, durationDays });
const lunar = (month, day, durationDays = 1) => ({ type: 'lunar', month, day, durationDays });
const catalog = [
  ['spring-festival', '春节', lunar(1, 1, 7), 'major'], ['lantern', '元宵', lunar(1, 15)],
  ['qingming', '清明', { type: 'annual', kind: 'qingming', durationDays: 1 }],
  ['dragon-boat', '端午', lunar(5, 5)], ['qixi', '七夕', lunar(7, 7)], ['mid-autumn', '中秋', lunar(8, 15)],
  ['national-day', '国庆', fixed(10, 1, 7)], ['new-year', '元旦', fixed(1, 1)], ['valentine', '情人节', fixed(2, 14)],
  ['easter', '复活节', { type: 'floating', kind: 'easter', durationDays: 1 }],
  ['halloween', '万圣节', fixed(10, 31), 'major'],
  ['thanksgiving', '感恩节（美国）', { type: 'floating', kind: 'thanksgiving-us', durationDays: 1 }],
  ['christmas', '圣诞节', fixed(12, 25), 'major'],
].map(([id, name, defaultRule, defaultLevel = 'decoration']) => ({ id, name, defaultRule, defaultLevel, defaultPriority: defaultLevel === 'major' ? 100 : 50, implemented: id === 'halloween', coverage: ['lunar', 'annual'].includes(defaultRule.type) ? coverage : null, options: id === 'halloween' ? ['header', 'hat', 'home', 'favicon', 'pageAccent'].map(id => ({ id, label: { header: '页头南瓜', hat: '吉祥物帽子', home: '首页装饰与讨糖', favicon: '南瓜图标', pageAccent: '其他页面轻装饰' }[id] })) : [] }));
function defaults() {
  return { mode: 'auto', manual: null, modules: Object.fromEntries(catalog.map(m => [m.id, { enabled: true, level: m.defaultLevel, priority: m.defaultPriority, rule: { ...m.defaultRule }, warmupDays: m.id === 'halloween' ? 6 : 0, extensionDays: m.id === 'halloween' ? 1 : 0, exceptions: {}, options: Object.fromEntries(m.options.map(o => [o.id, o.id !== 'pageAccent'])) }])) };
}
function fail(message) { const error = new Error(message); error.status = 400; throw error; }
function fields(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) fail(`${label}包含无效字段`);
}
function integer(value, min, max, label) { if (!Number.isInteger(value) || value < min || value > max) fail(`${label}超出范围`); }
function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const n = Date.parse(`${value}T00:00:00+08:00`);
  return Number.isFinite(n) && new Date(n + 8 * 3600000).toISOString().slice(0, 10) === value ? n : NaN;
}
function instant(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(dateValue(value.slice(0,10))) ? Date.parse(value) : NaN; }
function validate(config, now = Date.now(), saving = true) {
  fields(config, ['mode', 'manual', 'modules'], '配置');
  if (!['auto', 'off', 'manual'].includes(config.mode)) fail('无效模式');
  fields(config.modules, catalog.map(m => m.id), '节日目录');
  const result = defaults(); result.mode = config.mode;
  for (const m of catalog) {
    const c = config.modules[m.id];
    if (!Object.hasOwn(config.modules, m.id)) continue;
    fields(c, ['enabled', 'level', 'priority', 'rule', 'warmupDays', 'extensionDays', 'exceptions', 'options'], m.name);
    if (typeof c.enabled !== 'boolean' || !['major', 'decoration', 'easterEgg'].includes(c.level)) fail('无效启用状态或等级');
    integer(c.priority, 0, 1000, '优先级'); integer(c.warmupDays, 0, 60, '预热天数'); integer(c.extensionDays, 0, 60, '延长天数');
    const r = c.rule;
    fields(r, ['type', 'month', 'day', 'kind', 'durationDays'], '日期规则'); integer(r.durationDays, 1, 31, '持续天数');
    if (r.type === 'fixed' || r.type === 'lunar') {
      if (r.kind !== undefined) fail('日期规则不支持kind');
      integer(r.month, 1, 12, '月份'); integer(r.day, 1, r.type === 'lunar' ? 30 : 31, '日期');
      if (r.type === 'fixed' && !Number.isFinite(dateValue(`2028-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`))) fail('日期不存在');
    } else if ((r.type === 'floating' && ['easter', 'thanksgiving-us'].includes(r.kind)) || (r.type === 'annual' && r.kind === 'qingming')) {
      if (r.month !== undefined || r.day !== undefined) fail('该规则不支持月日字段');
    } else fail('不支持的日期规则');
    fields(c.exceptions, Array.from({length: 176}, (_, i) => String(2025 + i)), '年度例外');
    for (const [year, value] of Object.entries(c.exceptions)) if (value !== null && (!Number.isFinite(dateValue(value)) || !value.startsWith(year + '-'))) fail('年度例外日期无效');
    fields(c.options, m.options.map(o => o.id), '效果选项');
    if (Object.values(c.options).some(v => typeof v !== 'boolean')) fail('效果选项必须为开关');
    result.modules[m.id] = { ...JSON.parse(JSON.stringify(c)), options: { ...result.modules[m.id].options, ...c.options } };
  }
  if (config.manual != null) {
    fields(config.manual, ['id', 'expiresAt'], '手动指定');
    const m = catalog.find(m => m.id === config.manual.id && m.implemented);
    const end = instant(config.manual.expiresAt);
    if (!m || !Number.isFinite(end) || (saving && end <= now)) fail('手动主题必须已实现且设置未来失效时间');
    result.manual = { id: m.id, expiresAt: new Date(end).toISOString() };
  }
  if (config.mode === 'manual' && !result.manual) fail('手动模式必须指定主题和失效时间');
  return result;
}
const calendar = new Intl.DateTimeFormat('en-US-u-ca-chinese', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric' });
const lunarYears = new Map();
function calendarDate(rule, year) {
  const ymd = (month, day) => dateValue(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  if (rule.type === 'fixed') return ymd(rule.month, rule.day);
  if (rule.type === 'lunar' || rule.type === 'annual') {
    if (year < coverage.from || year > coverage.to) return NaN;
    if (rule.type === 'annual') return ymd(4, [4,5,5,4,4,5,5,4,4,5,5][year - 2025]);
    if (!lunarYears.has(year)) {
      const dates = new Map();
      for (let day = ymd(1, 1); day < dateValue(`${year + 1}-03-01`); day += DAY) {
        const parts = Object.fromEntries(calendar.formatToParts(day).map(p => [p.type, p.value]));
        if (Number(parts.relatedYear) === year && /^\d+$/.test(parts.month)) dates.set(`${parts.month}-${parts.day}`, day);
      }
      lunarYears.set(year, dates);
    }
    return lunarYears.get(year).get(`${rule.month}-${rule.day}`) ?? NaN;
  }
  if (rule.kind === 'thanksgiving-us') { const first = new Date(Date.UTC(year, 10, 1)).getUTCDay(); return ymd(11, 1 + (4 - first + 7) % 7 + 21); }
  // Gregorian Western Easter (Meeus/Jones/Butcher); Eastern Orthodox dates differ.
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19*a+b-d-g+15)%30, i = Math.floor(c/4), k = c%4, l = (32+2*e+2*i-h-k)%7, n = Math.floor((a+11*h+22*l)/451), q = h+l-7*n+114;
  return ymd(Math.floor(q / 31), q % 31 + 1);
}
function evaluate(config, now = Date.now()) {
  const year = new Date(now + 8 * 3600000).getUTCFullYear();
  let next = now + 60000;
  const manual = config.mode === 'manual' && config.manual && instant(config.manual.expiresAt) > now;
  if (manual) next = Math.min(next, instant(config.manual.expiresAt));
  const modules = catalog.map(m => {
    const c = config.modules[m.id];
    let hit = false, startNext = Infinity, windowLabel = ''; 
    for (let y = year - 1; y <= year + 8; y++) {
      const base = Object.hasOwn(c.exceptions, y) ? (c.exceptions[y] === null ? NaN : dateValue(c.exceptions[y])) : calendarDate(c.rule, y);
      if (!Number.isFinite(base)) continue;
      const start = base - c.warmupDays * DAY, end = base + (c.rule.durationDays + c.extensionDays) * DAY;
      if (start <= now && now < end) { hit = true; windowLabel = `${new Date(start + 28800000).toISOString().slice(0,10)} — ${new Date(end - 1 + 28800000).toISOString().slice(0,10)}`; }
      if (start > now) startNext = Math.min(startNext, start);
      for (const boundary of [start, end]) if (boundary > now) next = Math.min(next, boundary);
    }
    const unsupported = !hit && ['lunar', 'annual'].includes(c.rule.type) && (year < coverage.from || year > coverage.to) && !Object.hasOwn(c.exceptions, year);
    const status = !c.enabled ? 'disabled' : !m.implemented ? 'unimplemented' : unsupported ? 'invalid-date' : hit ? 'eligible' : 'scheduled';
    return { id: m.id, status, windowLabel, reason: { disabled: '未启用', unimplemented: '主题尚未实现', 'invalid-date': '日期表仅覆盖2025–2035，请配置年度例外', eligible: '日期命中', scheduled: '未到日期' }[status], nextStart: Number.isFinite(startNext) ? new Date(startNext).toISOString() : null, nextReason: Number.isFinite(startNext) ? '' : '未来八年内无可确定日期，请检查年度例外或日历覆盖范围' };
  });
  const candidates = modules.filter(m => m.status === 'eligible').sort((a,b) => config.modules[b.id].priority - config.modules[a.id].priority || a.id.localeCompare(b.id, 'en'));
  const chosen = config.mode === 'off' ? null : manual ? config.manual.id : candidates[0]?.id;
  for (const m of modules) {
    if (m.id === chosen) { m.status = 'active'; m.reason = manual ? '手动指定' : '自动命中'; }
    else if (m.status === 'eligible') { m.status = config.mode === 'off' ? 'off' : 'overridden'; m.reason = config.mode === 'off' ? '全部关闭' : manual ? '被手动指定主题覆盖' : '被更高优先级主题覆盖（同级按ID排序）'; }
  }
  const active = chosen ? { id: chosen, label: catalog.find(m => m.id === chosen).name, windowLabel: modules.find(m => m.id === chosen).windowLabel, level: config.modules[chosen].level, options: Object.fromEntries(Object.entries(config.modules[chosen].options).map(([key, value]) => [key, value && (config.modules[chosen].level === 'major' || (config.modules[chosen].level === 'decoration' ? key !== 'home' : ['header', 'favicon'].includes(key)))])) } : null;
  return { active, reason: config.mode === 'off' ? '全部关闭' : chosen ? manual ? '手动指定' : '自动命中' : '无生效主题', modules, serverTime: new Date(now).toISOString(), nextCheckAt: new Date(next).toISOString() };
}
module.exports = { catalog, defaults, validate, evaluate, calendarDate, coverage, instant };
