const assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
(async()=>{
 const server=await(await import('vite')).createServer({server:{host:'127.0.0.1',port:4276,strictPort:true,hmr:false,watch:{ignored:['**/.cache/**','**/outputs/**']}}});await server.listen();
 let browser;
 try{
 browser=process.env.PLAYWRIGHT_BROWSER==='webkit'?await webkit.launch():await chromium.launch({...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:process.platform==='win32'?{channel:'msedge'}:{})});
 for(const width of [320,390,768,1440])for(const theme of ['light','dark'])for(const [imageWidth,imageHeight] of [[611,129],[240,960],[400,400]]){
 const page=await browser.newPage({viewport:{width,height:950},reducedMotion:'reduce'});await page.addInitScript(t=>{if(location.origin==='http://127.0.0.1:4276')localStorage.setItem('mooncci-theme',t);},theme);
 let fail=true,saves=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let item={filename:'fixture.png',display_name:'媒体验收图片',alt_text:'',url:'/fixture.svg',size:100,size_text:'100 B',uploaded_at:'2026-10-01',status:'active',ext:'.png'};
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/fixture.svg',r=>r.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}"><rect width="100%" height="100%" fill="#888"/></svg>`}));
 await page.route('**/api/**',async r=>{const u=new URL(r.request().url());let json={};
 if(u.pathname==='/api/auth/session')json={user:{id:1,role:'owner',username:'fixture'}};
 else if(u.pathname==='/api/upload/media')json={items:[item],total:1,page:1,pageSize:50};
 else if(u.pathname==='/api/upload/media/fixture.png'&&r.request().method()==='PUT'){saves++;if(fail)return r.fulfill({status:503,json:{message:'测试保存失败，请重试'}});item={...item,...r.request().postDataJSON()};json=item;}
 await r.fulfill({json});});
 await page.goto('http://127.0.0.1:4276/admin/media');const trigger=page.getByRole('button',{name:'媒体验收图片',exact:true});await trigger.click();const dialog=page.getByRole('dialog',{name:'媒体验收图片',exact:true});await dialog.waitFor();
 const preview=dialog.locator('img');await preview.evaluate(image=>image.decode());
 const geometry=await preview.evaluate(image=>{const picture=image.getBoundingClientRect(),frame=image.parentElement.getBoundingClientRect();return {width:picture.width,height:picture.height,frameWidth:frame.width,frameHeight:frame.height};});
 assert(Math.abs(geometry.frameHeight-geometry.height)<1,'preview frame must not stretch to the form height');
 assert(Math.abs(geometry.frameWidth-geometry.width)<1,'preview frame should fit the image');
 assert(Math.abs(geometry.width/geometry.height-imageWidth/imageHeight)<.01,'image aspect ratio must be preserved');
 assert(geometry.height<=950*.62+1);assert(geometry.width<=imageWidth+1,'do not enlarge small images');
 for(let n=0;n<18;n++){await page.keyboard.press('Tab');assert(await dialog.evaluate(e=>e.contains(document.activeElement)),'Tab must remain inside media dialog');}
 const close=dialog.getByRole('button',{name:'关闭弹窗',exact:true});const box=await close.boundingBox();assert(box.width>=44&&box.height>=44);
 await page.getByLabel('Alt 文本',{exact:true}).fill('失败后需要保留的说明');await dialog.getByRole('button',{name:'保存显示信息',exact:true}).click();await dialog.getByRole('alert').waitFor();assert((await dialog.getByRole('alert').innerText()).trim().length>0);assert.equal(await page.getByLabel('Alt 文本',{exact:true}).inputValue(),'失败后需要保留的说明');
 fail=false;await dialog.getByRole('button',{name:'保存显示信息',exact:true}).click();await page.getByText('媒体信息已保存',{exact:true}).waitFor();assert.equal(saves,2);assert.equal(item.alt_text,'失败后需要保留的说明');assert.equal(await dialog.getByRole('alert').count(),0);
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await page.waitForFunction(e=>e===document.activeElement,await trigger.elementHandle());assert(await trigger.evaluate(e=>e===document.activeElement));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.close();console.log('PASS media dialog',width,theme);
 }
 console.log('PASS media dialog: compact preview, aspect ratio, keyboard containment, Escape, focus return, 44px close, failed save preserves input, retry; 24 viewport/theme/image combinations');
 }finally{await browser?.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
