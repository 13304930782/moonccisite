const test = require('node:test');
const assert = require('node:assert/strict');

test('interaction speech follows the persisted daily counts at every boundary', async () => {
  const { interactionSpeech } = await import('../../src/app/lib/companionSpeech.ts');
  for (const [count, text] of [[1, '摸到了。'], [2, '还想再摸吗。'], [4, '还想再摸吗。'], [5, '今天已经被摸好几下了。'], [9, '今天已经被摸好几下了。'], [10, '再摸我要害羞了。'], [19, '再摸我要害羞了。'], [20, '今天的摸摸额度快满了。'], [100, '今天的摸摸额度快满了。']]) {
    assert.equal(interactionSpeech('pet', count), text, `pet ${count}`);
  }
  for (const [count, text] of [[1, '哼。'], [2, '再打我真生气了。'], [3, '再打我真生气了。'], [4, '生气计时加长。'], [50, '生气计时加长。']]) {
    assert.equal(interactionSpeech('hit', count), text, `hit ${count}`);
  }
});

test('fourth and subsequent hits extend anger, while pets retain their original duration', async () => {
  const { reactionDuration } = await import('../../src/app/lib/companionSpeech.ts');
  assert.equal(reactionDuration('pet', 1), 2200);
  assert.equal(reactionDuration('pet', 20), 2200);
  for (const count of [1, 2, 3]) assert.equal(reactionDuration('hit', count), 3500);
  for (const count of [4, 5, 99]) assert.equal(reactionDuration('hit', count), 5000);
});

test('page messages match public routes without adding them to authentication pages', async () => {
  const { pageSpeech } = await import('../../src/app/lib/companionSpeech.ts');
  for (const [path, text] of [
    ['/', '首页安静的时候，我就待在这儿。'],
    ['/updates', '更新都在这边。'], ['/updates/4', '更新都在这边。'], ['/activity', '更新都在这边。'],
    ['/article/example', '这篇要是长，就慢慢看。'], ['/about', '又来看介绍了。'],
    ['/projects', '作品都搁在这儿。'], ['/projects/example', '作品都搁在这儿。'],
    ['/login', ''], ['/register', ''], ['/forgot-password', ''], ['/reset-password', ''], ['/articles', ''], ['/other', ''],
  ]) assert.equal(pageSpeech(path), text, path);
});

test('idle rotation schedules at most one page line per three turns and one news line per four', async () => {
  const { idleSpeechKind } = await import('../../src/app/lib/companionSpeech.ts');
  const turns = Array.from({length: 24}, (_, index) => idleSpeechKind(index + 1, true, true));
  assert.deepEqual(turns.slice(0, 12), ['ambient', 'ambient', 'page', 'news', 'ambient', 'page', 'ambient', 'news', 'page', 'ambient', 'ambient', 'news']);
  for (let i = 0; i <= turns.length - 3; i++) assert.ok(turns.slice(i, i + 3).filter(kind => kind === 'page').length <= 1);
  for (let i = 0; i <= turns.length - 4; i++) assert.ok(turns.slice(i, i + 4).filter(kind => kind === 'news').length <= 1);
  assert.equal(idleSpeechKind(3, false, true), 'ambient');
  assert.equal(idleSpeechKind(4, true, false), 'ambient');
  assert.equal(idleSpeechKind(12, false, true), 'news');
  assert.equal(idleSpeechKind(12, false, false), 'ambient');
});

test('news titles reject previews and placeholders without truncating', async () => {
  const { publicNewsTitle } = await import('../../src/app/lib/companionSpeech.ts');
  for (const value of ['', null, '文章预览', '示例：天气小球', 'PLACEHOLDER', 'some Placeholder text']) assert.equal(publicNewsTitle(value), '');
  assert.equal(publicNewsTitle('  天气小球  '), '  天气小球  ');
  assert.equal(publicNewsTitle('Cities: Skylines II 都市天际线2 进阶 Mod 推荐'), 'Cities: Skylines II 都市天际线2 进阶 Mod 推荐');
});
