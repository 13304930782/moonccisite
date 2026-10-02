const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const compiled=require('esbuild').buildSync({entryPoints:['src/app/lib/loginDestination.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
const sandbox={module:{exports:{}},URL,URLSearchParams};vm.runInNewContext(compiled,sandbox);const {loginDestination,authLink}=sandbox.module.exports;
test('login returns to allowed task routes but never an external or executable destination',()=>{
 for(const p of ['/account/submissions','/account/write?draft=123','/account/notifications','/admin/reviews?state=failed','/article/12#comments','/updates/4#comments-update-4','/electricity?roomId=test'])assert.equal(loginDestination(p),p);
 for(const p of ['https://evil.test','//evil.test','/\\evil.test','javascript:alert(1)','/api/auth/logout','/login?redirect=/admin','/account/../api/settings','/\n/evil.test',null])assert.equal(loginDestination(p),'');
 assert.equal(new URL(authLink('/register','/account/write?draft=123'),'https://local.invalid').searchParams.get('redirect'),'/account/write?draft=123');
});

test('browser and server share return rules; reset credentials stay out of request URL',()=>{
 const backend=require('../server/src/lib/loginDestination');
 for(const p of ['/account/write?draft=123','/account/settings?token=secret','/article/4#comments','/updates/4#comments-update-4','//evil.test','/updates/../api/auth/logout','/updates/4//evil.test','/admin/reviews?state=failed','/account/submissions?redirect=https://evil.test'])assert.equal(loginDestination(p),backend.loginDestination(p));
 const u=new URL(backend.resetLink('https://mooncci.site','secret','/account/submissions'));
 assert.equal(u.searchParams.get('token'),null);assert.equal(u.searchParams.get('redirect'),'/account/submissions');assert.equal(u.hash,'#token=secret');
});
