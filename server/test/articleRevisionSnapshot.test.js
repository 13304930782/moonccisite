const test=require('node:test'),assert=require('node:assert/strict'),{snapshot,hash}=require('../src/lib/articleRevisions');
test('revision snapshots exclude account data, counters and public timestamps',()=>{
 const p={title:'标题',content:'markdown',tags:'["a"]',source_url:'https://example.test/old',views:99,author_id:1,email:'private@example.test',published_at:'2024-01-01',updated_at:'2026-01-01'};
 assert.deepEqual(Object.keys(snapshot(p)).sort(),['category','content','cover_image','slug','source_url','summary','tags','title']);
 assert.equal(hash(p),hash({...p,tags:['a'],views:100,updated_at:'2026-09-19'}));assert.notEqual(hash(p),hash({...p,content:'edited'}));
});
