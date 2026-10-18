const test=require('node:test'),assert=require('node:assert/strict'),{snapshot,hash}=require('../src/lib/articleRevisions');
test('revision snapshots exclude account data, counters and public timestamps',()=>{
 const p={title:'标题',content:'markdown',tags:'["a"]',source_url:'https://example.test/old',views:99,author_id:1,email:'private@example.test',published_at:'2024-01-01',updated_at:'2026-01-01'};
 assert.deepEqual(Object.keys(snapshot(p)).sort(),['category','content','cover_crop','cover_image','slug','source_url','summary','summary_mode','summary_receipt','tags','title']);
 assert.equal(hash(p),hash({...p,tags:['a'],views:100,updated_at:'2026-09-19'}));assert.notEqual(hash(p),hash({...p,content:'edited'}));
});

test('draft payloads and revisions preserve image layout through JSON storage',()=>{
 const {payload}=require('../src/lib/articlePublishing');
 const content='<!--mooncci-richtext:v1--><img src="/api/uploads/mod.webp" width="80" data-image-align="left" data-image-layout="heading" alt="Anarchy"><h2>Anarchy</h2><p>推荐说明</p>';
 const saved=JSON.parse(JSON.stringify(payload({title:'Mod 推荐',content})));
 assert.equal(saved.content,content);
 assert.equal(snapshot(saved).content,content);
 assert.notEqual(hash(saved),hash({...saved,content:content.replace('width="80"','width="160"')}));
});
