const assert=require('node:assert/strict'),fs=require('node:fs/promises'),{chromium}=require('playwright');
(async()=>{const {preview}=await import('vite');const server=process.env.SETTINGS_PREVIEW_URL?null:await preview({preview:{host:'127.0.0.1',port:4996,strictPort:true},logLevel:'error'});let browser;try{browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
let ai={enabled:false,model:'deepseek-flash',has_key:true},fail=false;
await page.route('**/api/**',async route=>{const p=new URL(route.request().url()).pathname;let body={items:[],total:0};
if(p==='/api/auth/session'||p==='/api/account')body={user:{id:1,username:'Owner',email:'qa@example.invalid',role:'owner',status:'active'}};
else if(p==='/api/settings/site')body={brand:{site_title:'Example blog'},hero:{title:'Example headline'},footer:{copyright:'Example'},weather:{enabled:false}};
else if(p==='/api/now')body={content:'Example update',updated_at:null};
else if(p==='/api/article-seo/settings'){if(route.request().method()==='PUT'){if(fail)return route.fulfill({status:500,json:{message:'测试保存失败'}});const input=route.request().postDataJSON();ai={enabled:input.enabled,model:input.model,has_key:true};}body=ai;}
else if(p==='/api/node-monitor/settings')body={configured:true};
else if(p==='/api/auth/providers/manage')body={providers:[{provider:'github',name:'GitHub',enabled:false,ready:false,client_id:'test-client-id',has_secret:true,version:1,source:'database',callback_url:'https://example.invalid/api/auth/github/callback',origin:'https://example.invalid'}]};
else if(p==='/api/settings/mail')body={smtp_host:'smtp.example.invalid',has_smtp_pass:true};
else if(p==='/api/engagement/notifications/unread')body={unread:0};
else if(p==='/api/publishing/config'||p==='/api/engagement/config')body={enabled:true};
await route.fulfill({json:body});});
const base=process.env.SETTINGS_PREVIEW_URL||'http://127.0.0.1:4996';await fs.mkdir('.cache/settings-qa',{recursive:true});
for(const [path,selector] of [['login-settings','.admin-settings-section'],['node-monitor','.node-save'],['ai-settings','.settings-save'],['mail-settings','.workflow-primary'],['site-settings','#brand']]){
 for(const width of [1920,1280,1024,768,375])for(const theme of ['light','dark']){
 await page.setViewportSize({width,height:1000});await page.goto(`${base}/admin/${path}`);await page.locator(selector).first().waitFor();
 if(await page.locator('html').getAttribute('data-moon-theme')!==theme) await page.getByRole('button',{name:theme==='dark'?'切换深色主题':'切换浅色主题',exact:true}).click();
 await page.waitForFunction(t=>document.documentElement.dataset.moonTheme===t,theme);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${path} ${width} horizontal overflow`);
 const wrapped=await page.locator('button').evaluateAll(nodes=>nodes.filter(e=>{if(!e.offsetWidth||!e.textContent.trim())return false;const style=getComputedStyle(e);return style.whiteSpace!=='nowrap'&&e.scrollWidth>e.clientWidth;}).map(e=>e.textContent));assert.deepEqual(wrapped,[],`${path} ${width} clipped buttons`);
 if(path==='site-settings')assert.ok(await page.locator('.settings-image-actions > button,.settings-save > button').evaluateAll(nodes=>nodes.every(e=>getComputedStyle(e).whiteSpace==='nowrap')),`site settings ${width} button wrapping`);
 await page.screenshot({path:`.cache/settings-qa/${path}-${width}-${theme}.png`,fullPage:true});
 }
}
await page.goto(`${base}/admin/ai-settings`);const key=page.getByLabel('DeepSeek API Key',{exact:true});await key.waitFor();await key.fill('test-key');fail=true;await page.getByRole('button',{name:'保存 AI 设置',exact:true}).click();await page.getByRole('alert').filter({hasText:'测试保存失败'}).waitFor();assert.equal(await key.inputValue(),'test-key');await page.getByRole('button',{name:'放弃更改',exact:true}).click();assert.equal(await key.inputValue(),'');assert.ok(await page.getByRole('button',{name:'保存 AI 设置',exact:true}).isDisabled());
assert.deepEqual(errors,[]);console.log('PASS settings 5 pages × 5 widths × light/dark; no horizontal overflow; AI failure retention/discard; no real sends.');
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));}})().catch(e=>{console.error(e);process.exitCode=1;});
