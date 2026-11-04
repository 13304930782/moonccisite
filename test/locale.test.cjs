const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),vm=require('node:vm');
let locale;
test.before(async()=>{const result=await require('esbuild').build({entryPoints:['src/app/lib/locale.ts'],bundle:true,write:false,format:'cjs',platform:'node'});const context={module:{exports:{}},URL};vm.runInNewContext(result.outputFiles[0].text,context);locale=context.module.exports;});
test('language matching respects navigator priority and recognized regional variants',()=>{
 for(const [input,expected] of [[['zh-TW','en-US'],'zh-CN'],[['fr','en-GB','zh-CN'],'en'],[['en-US'],'en'],[['zh-CN'],'zh-CN'],[['ja'],'zh-CN']])assert.equal(locale.systemLocale(input),expected);
});
test('public language routes preserve content identity, query and hash without exposing private paths',()=>{
 assert.equal(locale.localizedPath('/article/20?q=word#heading','en'),'/en/article/20?q=word#heading');
 assert.equal(locale.localizedPath('/en/article/old-slug?page=2','zh-CN'),'/article/old-slug?page=2');
 assert.equal(locale.localizedPath('/en','en'),'/en');
 for(const path of ['/api/posts','/admin/posts','/account/settings','/assets/a.js','/uploads/a.jpg','/auth/google/callback','/node-monitor','//external.invalid/'])assert.equal(locale.localizedPath(path,'en'),path);
});
test('resource locale is explicit and isolated, with legacy Chinese keys preserved',()=>{
 assert.equal(locale.localeResource('/posts?page=2','en'),'/posts?page=2&locale=en');
 assert.equal(locale.localeResource('/posts/20?locale=zh-CN','en'),'/posts/20?locale=zh-CN');
 assert.equal(locale.localeResource('/posts/20','zh-CN'),'/posts/20');
 assert.equal(locale.localeResource('/account','en'),'/account');
});
test('blocked and malformed storage safely fall back to memory',()=>{
 assert.equal(locale.readLanguage({getItem(){throw Error('blocked');}}),null);
 assert.equal(locale.readLanguage({getItem:()=>'{bad'}),null);
 assert.equal(locale.readLanguage({getItem:()=>JSON.stringify({preference:'javascript',version:1})}),null);
 assert.equal(locale.readLanguage({getItem:()=>JSON.stringify({preference:'en',version:1})}).preference,'en');
});
