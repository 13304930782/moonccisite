const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/lib/dailyQuestion');

test('Beijing clock and option validation preserve the requested boundaries', () => {
  assert.deepEqual(rules.shanghaiTime(Date.parse('2026-11-12T14:59:59Z')).hour, 22);
  assert.deepEqual(rules.shanghaiTime(Date.parse('2026-11-12T15:00:00Z')).hour, 23);
  assert.equal(rules.shanghaiTime(Date.parse('2026-11-12T16:00:00Z')).date, '2026-11-13');
  assert.equal(rules.previousDate('2026-03-01'), '2026-02-28');
  assert.equal(rules.validDate('2026-02-30'), false);
  assert.deepEqual(rules.cleanChoices(['甲', '乙']), ['甲', '乙']);
  assert.equal(rules.cleanChoices([]), null);
  for (const value of [['甲'], ['甲', '甲'], ['甲', ''], ['字'.repeat(21), '乙']]) assert.throws(() => rules.cleanChoices(value));
});

test('word cloud excludes whole answers, banned text and contact information', () => {
  const rows = [{text:'今天喝咖啡非常开心'}, {text:'朋友喝咖啡也很开心'}, {text:'咖啡'}, {text:'咖啡！'}, {text:'喝咖啡禁词'}, {text:'喝咖啡 a@example.com'}, {text:'喝咖啡 138 1234 5678'}];
  const result = rules.aggregate({choices:null}, rows, ['禁词']);
  assert.deepEqual(result.words, [{text:'咖啡',count:2}, {text:'开心',count:2}]);
  assert.doesNotMatch(JSON.stringify(result), /今天喝咖啡非常开心|禁词|example|13812345678/);
  assert.equal(rules.summaryText({choices:null}, result).includes('咖啡（2）'), true);
  const choices = rules.aggregate({choices:'["甲","乙"]'}, [{choice_index:0},{choice_index:1},{choice_index:0}], []);
  assert.deepEqual(choices, {type:'choice',total:3,counts:[2,1]});
});

test('anonymous daily cookie is server signed and hashes without exposing cookie', () => {
  const cookie = rules.makeCookie('2026-11-12','test-secret');
  assert.equal(rules.validCookie(cookie,'2026-11-12','test-secret'), true);
  assert.equal(rules.validCookie(cookie,'2026-11-13','test-secret'), false);
  assert.equal(rules.validCookie(cookie,'2026-11-12','another-secret'), false);
  assert.equal(rules.cookieKey(cookie).includes(cookie), false);
});
