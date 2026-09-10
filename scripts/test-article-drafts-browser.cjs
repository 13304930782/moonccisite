const assert=require('node:assert/strict');
const {chromium}=require('playwright');
async function main(){const {preview}=await import('vite');const server=await preview({preview:{host:'127.0.0.1',port:4197,strictPort:true}});let browser;
try{browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});const page=await browser.newPage({viewport:{width:390,height:844}});let draft,offline=false,saves=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname,method=route.request().method();let body={};
if(path==='/api/auth/me')body={user:{id:1,username:'Writer',role:'owner'}};
else if(path==='/api/upload/media')body={items:[{filename:'fixture.png',display_name:'测试图片',url:'/fixture.png',alt_text:''}],total:1};
else if(path==='/api/article-drafts'&&method==='POST'){const input=route.request().postDataJSON();draft ||= {id:input.id,version:1,payload:input.payload,updated_at:new Date().toISOString()};body=draft;}
else if(path.startsWith('/api/article-drafts/')){if(offline){await route.abort();return;}if(method==='PUT'){const input=route.request().postDataJSON();assert.equal(input.version,draft.version);draft={...draft,payload:input.payload,version:draft.version+1,updated_at:new Date().toISOString()};saves++;}body=draft;}
await route.fulfill({json:body});});
await page.goto('http://127.0.0.1:4197/admin/write');await page.getByRole('textbox',{name:'标题',exact:true}).fill('Automatic draft');await page.getByRole('button',{name:'Markdown 源码',exact:true}).click();await page.getByRole('textbox',{name:'Markdown 正文'}).fill('Retain this **Markdown**.');
await page.waitForFunction(()=>document.body.textContent.includes('已保存到服务器 ·'));assert.equal(draft.payload.content,'Retain this **Markdown**.');assert.ok(saves>0);
offline=true;await page.getByRole('textbox',{name:'标题',exact:true}).fill('Local recovery');await page.waitForFunction(()=>document.body.textContent.includes('保存失败'));offline=false;
page.once('dialog',d=>d.accept());await page.reload();await page.getByRole('button',{name:'恢复本地内容',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'标题',exact:true}).inputValue(),'Local recovery');await page.getByRole('button',{name:'保存草稿',exact:true}).click();await page.waitForFunction(()=>document.body.textContent.includes('已保存到服务器 ·'));assert.equal(draft.payload.title,'Local recovery');
for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}require('node:fs').mkdirSync('.cache',{recursive:true});await page.screenshot({path:'.cache/article-workspace.png'});assert.deepEqual(errors,[]);console.log('PASS: autosave, offline backup, explicit recovery and mobile editor.');
}finally{await browser?.close();await server.httpServer.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
