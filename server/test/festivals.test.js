const test = require('node:test');
const assert = require('node:assert/strict');
const { catalog, defaults, validate, evaluate, calendarDate } = require('../src/lib/festivals');
const at = s => Date.parse(s + '+08:00');
test('Halloween keeps Oct25 inclusive to Nov2 exclusive in Shanghai', () => {
  const c = defaults();
  assert.equal(evaluate(c, at('2026-10-24T23:59:59')).active, null);
  assert.equal(evaluate(c, at('2026-10-25T00:00:00')).active.id, 'halloween');
  assert.equal(evaluate(c, at('2026-11-01T23:59:59')).active.id, 'halloween');
  assert.equal(evaluate(c, at('2026-11-02T00:00:00')).active, null);
});
test('off wins, manual expiry returns auto, unimplemented cannot displace implemented', () => {
  const c = defaults(), now = at('2026-10-26T12:00:00');
  c.mode = 'off'; c.manual = { id: 'halloween', expiresAt: new Date(now + 1000).toISOString() };
  assert.equal(evaluate(c, now).active, null);
  c.mode = 'manual'; assert.equal(evaluate(c, now).reason, '手动指定');
  assert.equal(evaluate(c, now + 1000).reason, '自动命中');
  c.modules.christmas.rule = { type: 'fixed', month: 10, day: 26, durationDays: 1 }; c.modules.christmas.priority = 1000;
  assert.equal(evaluate(c, now).active.id, 'halloween');
  assert.equal(evaluate(c, now).modules.find(m => m.id === 'christmas').status, 'unimplemented');
});
test('preheat crosses years, annual exception and cancellation take precedence', () => {
  const c = defaults(), h = c.modules.halloween;
  h.rule = { type: 'fixed', month: 1, day: 1, durationDays: 1 }; h.warmupDays = 3; h.extensionDays = 1;
  assert.equal(evaluate(c, at('2025-12-29T00:00:00')).active.id, 'halloween');
  assert.equal(evaluate(c, at('2026-01-03T00:00:00')).active, null);
  h.exceptions['2026'] = null;
  assert.equal(evaluate(c, at('2025-12-29T00:00:00')).active, null);
  h.exceptions['2026'] = '2026-01-10';
  assert.equal(evaluate(c, at('2026-01-07T00:00:00')).active.id, 'halloween');
});
test('Chinese lunar non-leap dates and Western/US floating dates match known dates; coverage is finite', () => {
  const date = (rule, year) => new Date(calendarDate(rule, year) + 28800000).toISOString().slice(0, 10);
  for (const [year, month, day, expected] of [[2025,1,1,'2025-01-29'],[2026,1,1,'2026-02-17'],[2026,5,5,'2026-06-19'],[2026,8,15,'2026-09-25'],[2025,6,1,'2025-06-25']]) assert.equal(date({type:'lunar',month,day},year), expected);
  assert.equal(date({type:'floating',kind:'easter'},2026),'2026-04-05');
  assert.equal(date({type:'floating',kind:'thanksgiving-us'},2026),'2026-11-26');
  assert.equal(date({type:'annual',kind:'qingming'},2026),'2026-04-05');
  assert.ok(Number.isNaN(calendarDate({type:'lunar',month:1,day:1},2036)));
  const c = defaults(); c.modules.halloween.rule = {type:'lunar',month:1,day:1,durationDays:1};
  assert.equal(evaluate(c,at('2036-02-01T00:00:00')).modules.find(m=>m.id==='halloween').status,'invalid-date');
});
test('strict declarative whitelist rejects scripts, unknown holidays, invalid dates and expired manual mode', () => {
  for (const change of [c => c.modules['party-day'] = c.modules.halloween, c => c.modules['army-day'] = c.modules.halloween, c => c.html = '<script>', c => c.modules.halloween.options.src = 'https://bad', c => c.modules.halloween.rule.day = 32, c => c.modules.halloween.exceptions['2026'] = '2026-02-30', c => { c.mode = 'manual'; c.manual = {id:'christmas',expiresAt:'2090-01-01T00:00:00Z'}; }, c => { c.mode = 'manual'; c.manual = {id:'halloween',expiresAt:'2020-01-01T00:00:00Z'}; }]) { const c = defaults(); change(c); assert.throws(()=>validate(c)); }
  assert.equal(catalog.length,13); assert.deepEqual(validate(defaults()),defaults());
});
test('implemented conflicts obey priority then stable ID, with selection reasons', () => {
  const c=defaults(), christmas=catalog.find(m=>m.id==='christmas');
  christmas.implemented=true;
  try {
    c.modules.christmas.rule={type:'fixed',month:10,day:31,durationDays:1};
    c.modules.christmas.priority=1000;
    const now=at('2026-10-31T00:00:00');
    assert.equal(evaluate(c,now).active.id,'christmas');
    assert.equal(evaluate(c,now).modules.find(m=>m.id==='halloween').status,'overridden');
    c.modules.christmas.priority=c.modules.halloween.priority;
    assert.equal(evaluate(c,now).active.id,'christmas');
    c.modules.christmas.enabled=false;
    assert.equal(evaluate(c,now).active.id,'halloween');
  } finally { christmas.implemented=false; }
});

test('missing options inherit defaults while explicit malformed modules are rejected', () => {
  for (const malformed of [null, false, 0, '', []]) {
    const c = defaults(); c.modules.halloween = malformed;
    assert.throws(() => validate(c), /无效字段/);
  }
  const c = defaults(); c.modules.halloween.options = { hat: false };
  const saved = validate(c);
  assert.deepEqual(saved.modules.halloween.options, { ...defaults().modules.halloween.options, hat: false });
  assert.equal(evaluate(saved, at('2026-10-26T00:00:00')).active.options.header, true);
  assert.deepEqual(c.modules.halloween.options, { hat: false });
  delete c.modules.halloween;
  assert.deepEqual(validate(c).modules.halloween, defaults().modules.halloween);
});

test('display levels limit active effects without changing saved options', () => {
  const c = defaults(), h = c.modules.halloween, now = at('2026-10-26T00:00:00');
  h.options.pageAccent = true;
  const original = { ...h.options };
  assert.deepEqual(evaluate(c, now).active.options, original);
  h.level = 'decoration';
  assert.deepEqual(evaluate(c, now).active.options, { ...original, home: false });
  h.level = 'easterEgg';
  assert.deepEqual(evaluate(c, now).active.options, { header: true, favicon: true, home: false, hat: false, pageAccent: false });
  assert.deepEqual(h.options, original);
  h.options.header = false;
  assert.equal(evaluate(c, now).active.options.header, false);
});
