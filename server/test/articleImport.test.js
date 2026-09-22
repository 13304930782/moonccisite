const test=require('node:test'),assert=require('node:assert/strict');
const {validateUrl,publicV4}=require('../src/lib/articleImportFetch');
const {convertPost}=require('../src/lib/articleImportConvert');
const post=()=>({status:'publish',type:'post',title:{rendered:'A &amp; B'},slug:'test',date:'2026-04-07T00:33:08',content:{rendered:'<p><b>一、标题</b></p><p>正文<strong>强调</strong></p><img src="/load.svg" data-src="/wp-content/uploads/a.png" title="old title"><script>alert(1)</script><table><tr><th>项目</th></tr><tr><td>内容</td></tr></table>'},_embedded:{'wp:term':[[{taxonomy:'category',name:'网络安全'}]]}});
test('rejects unexpected origins, credentials, protocols and private address ranges',()=>{for(const u of ['http://moooncci.cn/a','https://evil.test/a','https://user:pass@moooncci.cn/a','https://127.0.0.1/a','https://moooncci.cn:123/a'])assert.throws(()=>validateUrl(u));for(const ip of ['127.0.0.1','10.1.1.1','169.254.169.254','192.168.1.1','172.31.1.1','100.64.0.1','0.0.0.0','::1','224.1.1.1'])assert.equal(publicV4(ip),false);assert.equal(publicV4('8.8.8.8'),true);});
test('WordPress lazy images, headings, tables and original date survive conversion',()=>{const r=convertPost(post(),'https://moooncci.cn/test/');assert.equal(r.payload.title,'A & B');assert.equal(r.images.length,1);assert.equal(r.images[0].source,'https://moooncci.cn/wp-content/uploads/a.png');assert.match(r.payload.content,/\(mooncci-import-image-0\)/);assert.doesNotMatch(r.payload.content,/old title|alert\(1\)|load.svg/);assert.match(r.payload.content,/## 一、标题/);assert.match(r.payload.content,/\| 项目 \|/);assert.equal(r.payload.category,'网络安全');assert.equal(r.payload.published_at,'2026-04-07 00:33:08');});
test('unsupported image hosts and private drafts stop import',()=>{const p=post();p.content.rendered='<img src="https://evil.test/image.png">';assert.throws(()=>convertPost(p,'https://moooncci.cn/test/'));p.status='draft';assert.throws(()=>convertPost(p,'https://moooncci.cn/test/'));});

test('table conversion escapes pre-existing backslashes before pipe delimiters',()=>{
 const p=post();p.content.rendered='<table><tr><th>Header</th></tr><tr><td>'+String.raw`C:\path\|value | next`+'</td></tr></table>';
 const content=convertPost(p,'https://moooncci.cn/test/').payload.content;
 assert.ok(content.includes(String.raw`C:\\path\\\|value \| next`),content);
});
