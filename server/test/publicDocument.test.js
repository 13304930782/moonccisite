const test=require('node:test'),assert=require('node:assert/strict');
const {isPublicResource,serialize}=require('../src/lib/publicDocument');
test('document prefetch has a fixed anonymous public allowlist',()=>{
 for(const path of ['/posts/7','/posts/7/discovery','/posts?tag=React&format=paged&page=2','/settings/site','/subscriptions/status'])assert.equal(isPublicResource(path),true,path);
 for(const path of ['//evil.test/posts','/auth/me','/posts?status=draft','/series?manage=true','/admin/posts','/posts/../auth/me','/posts?token=secret'])assert.equal(isPublicResource(path),false,path);
});
test('bootstrap JSON cannot escape its inert script element',()=>{
 const data={title:'</script><script>alert(1)</script>&\u2028'};
 const text=serialize(data);assert.ok(!text.includes('<'));assert.deepEqual(JSON.parse(text),data);
});
