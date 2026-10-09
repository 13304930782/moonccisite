const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium,webkit}=require('playwright');
(async()=>{
 const server=await(await import('vite')).createServer({server:{host:'127.0.0.1',port:4278,strictPort:true,hmr:false,watch:{ignored:['**/.cache/**','**/outputs/**']}}});await server.listen();let browser;
 const results=[],out=process.env.QA_IMAGE_OUTPUT;
 if(out)fs.mkdirSync(out,{recursive:true});
 try{
 browser=process.env.PLAYWRIGHT_BROWSER==='webkit'?await webkit.launch():await chromium.launch({...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:process.platform==='win32'?{channel:'msedge'}:{})});
 for(const width of [320,390,768,1440])for(const theme of ['light','dark'])for(const sized of [false,true]){
 const page=await browser.newPage({viewport:{width,height:950},reducedMotion:'reduce'});await page.addInitScript(t=>{if(window.top===window&&location.pathname.startsWith('/article/'))localStorage.setItem('mooncci-theme',t);},theme);
 let release;const gate=new Promise(r=>release=r),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const image_dimensions={'/api/uploads/cover.svg':{width:600,height:360},'/api/uploads/portrait.svg':{width:240,height:480}};
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',async r=>{
  const u=new URL(r.request().url());
  if(u.pathname.startsWith('/api/uploads/')){await gate;const size=image_dimensions[u.pathname];return r.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><rect width="100%" height="100%" fill="#888"/></svg>`});}
  let json={};
  if(u.pathname==='/api/auth/session')return r.fulfill({status:401,json:{message:'未登录'}});
  if(u.pathname==='/api/posts/1')json={id:1,title:'图片布局验收',author_name:'测试作者',status:'published',tags:[],cover_image:'/api/uploads/cover.svg',content:'## 正文\n\n![竖图](/api/uploads/portrait.svg)\n\n图片下方的文字应保持位置。',...(sized?{image_dimensions}:{})};
  else if(u.pathname==='/api/posts/1/discovery')json={related:[],previous:null,next:null};
  else if(u.pathname==='/api/series/article/1')json=null;
  else if(/comments|related|backlinks/.test(u.pathname))json=[];
  await r.fulfill({json});
 });
 await page.goto('http://127.0.0.1:4278/article/1',{waitUntil:'domcontentloaded'});
 const cover=page.locator('.article-presentation .content-image'),portrait=page.locator('.markdown-body img');await portrait.waitFor({state:'attached'});
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const marker=page.getByText('图片下方的文字应保持位置。',{exact:true});
 const y=()=>marker.evaluate(e=>e.getBoundingClientRect().top+scrollY);
 const before=await y(),coverBefore=await cover.boundingBox(),portraitBefore=await portrait.boundingBox();
 if(sized){assert(Math.abs(coverBefore.width/coverBefore.height-600/360)<.01);assert(Math.abs(portraitBefore.width/portraitBefore.height-.5)<.01);}
 if(out&&width===390&&theme==='light')await page.screenshot({path:path.join(out,sized?'reserved.png':'before.png')});
 release();await portrait.scrollIntoViewIfNeeded();await page.waitForFunction(()=>[...document.querySelectorAll('.article-presentation img')].every(i=>i.complete&&i.naturalWidth>0));
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const after=await y(),shift=Math.abs(after-before);
 if(sized)assert(shift<1,`reserved image moved text by ${shift}px`);else assert(shift>100,'baseline must reproduce the jump');
 assert.equal(await portrait.getAttribute('loading'),'lazy');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 results.push({width,theme,sized,textMovementPx:shift});await page.close();console.log('PASS article image',width,theme,sized?'reserved':'baseline',shift);
 }
 if(out)fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2)+'\n');
 }finally{await browser?.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
