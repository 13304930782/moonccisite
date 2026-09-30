const test = require('node:test');
const assert = require('node:assert/strict');
const { articleImageDimensions } = require('../src/lib/articleImages');
test('only referenced local active images are queried once, with bound parameters', async () => {
  let calls = 0;
  const db = { query: async (sql, params) => {
    calls++; assert.match(sql, /status='active'/);
    assert.deepEqual(params, ['cover.webp', 'body.png', 'ref.jpg']);
    return [[{filename:'cover.webp',width:800,height:600}, {filename:'body.png',width:400,height:900},
      {filename:'ref.jpg',width:null,height:9}, {filename:'unrelated.png',width:800,height:600}]];
  }};
  const dimensions = await articleImageDimensions({cover_image:'/api/uploads/cover.webp',content:
    '![A](/api/uploads/body.png?v=2) ![B](/api/uploads/body.png)\n[x]: /api/uploads/ref.jpg\n![remote](https://elsewhere.test/api/uploads/remote.png)'}, db);
  assert.equal(calls,1);
  assert.deepEqual(dimensions, {'/api/uploads/cover.webp':{width:800,height:600},'/api/uploads/body.png':{width:400,height:900}});
});
test('no local images means no extra database query; large articles are bounded', async () => {
  assert.deepEqual(await articleImageDimensions({content:'text'}, {query:()=>assert.fail('unexpected query')}),{});
  await articleImageDimensions({content:Array.from({length:400},(_,i)=>`![](/api/uploads/${i}.png)`).join('\n')},
    {query:async(_,params)=>{assert.equal(params.length,200);return [[]];}});
});
test('invalid sizes are omitted',async()=>{
  const result=await articleImageDimensions({content:'![](/api/uploads/a.png)'},
    {query:async()=>[[{filename:'a.png',width:0,height:30},{filename:'a.png',width:Infinity,height:30}]]});
  assert.deepEqual(result,{});
});
