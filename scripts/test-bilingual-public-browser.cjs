const {chooseInterfaceLanguage}=require('./fixtures/language-menu.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),{chromium,webkit}=require('playwright');
(async()=>{
 const server=await(await import('vite')).createServer({server:{host:'127.0.0.1',port:4278,strictPort:true,hmr:false,fs:{allow:[process.cwd(),require('node:path').resolve(require.resolve('vite'),'../../../..')]},watch:{ignored:['**/.cache/**','**/outputs/**']}}});await server.listen();
 const express=require('../server/node_modules/express');const metadataApp=express();metadataApp.use(require('../server/src/routes/seo').createSeoRouter({db:{query:async()=>[[]]}}));const metadataServer=metadataApp.listen(0,'127.0.0.1');await new Promise(resolve=>metadataServer.once('listening',resolve));const metadataOrigin='http://127.0.0.1:'+metadataServer.address().port;
 const records=[];
 try{for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch(name==='chromium'?(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}):{});
  try{const context=await browser.newContext({locale:'zh-CN',viewport:{width:name==='webkit'?375:1280,height:900}}),page=await context.newPage(),errors=[],views=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   const post=(slug,en)=>({id:slug==='a'?41:42,slug,title:(en?'English ':'中文')+slug,summary:en?'English summary':'中文简介',content:en?'## Reading\n\nEnglish content':'## 阅读\n\n中文正文',status:'published',content_locale:en?'en':'zh-CN',requested_locale:en?'en':'zh-CN',available_locales:['zh-CN','en'],created_at:'2026-11-01T01:00:00Z',published_at:'2026-11-01T01:00:00Z',tags:[]});
   await context.route('**/api/**',async r=>{const url=new URL(r.request().url()),p=url.pathname,en=url.searchParams.get('locale')==='en';let json={};
    if(p==='/api/seo'&&url.searchParams.get('path')==='/login'){const response=await fetch(metadataOrigin+url.pathname+url.search);return r.fulfill({status:response.status,json:await response.json()});}
    if(p==='/api/auth/session')json={user:null};
    else if(p==='/api/auth/providers')json={providers:[]};
    else if(p==='/api/settings/site')json={brand:{},weather:{enabled:false},navigation:[],subscription:{enabled:false}};
    else if(p==='/api/analytics/view'){views.push(r.request().postDataJSON());json={views:12};}
    else if(/^\/api\/posts\/[^/]+\/discovery$/.test(p))json={next:post(p.includes('/41/')?'b':'a',en),related:[]};
    else if(/^\/api\/posts\/(a|b)$/.test(p))json=post(p.split('/').pop(),en);
    else if(p.includes('/comments'))json=[];
    else if(p.startsWith('/api/series/article/'))return r.fulfill({status:404,json:{message:'No series'}});
    return r.fulfill({json});
   });
   const origin='http://127.0.0.1:4278',check=async(slug,en)=>{await page.waitForURL(origin+(en?'/en':'')+'/article/'+slug);await page.getByRole('heading',{level:1,name:(en?'English ':'中文')+slug,exact:true}).waitFor();};
   await page.goto(origin+'/article/a');await check('a',false);await page.locator('.article-neighbors a').click();await check('b',false);
   await chooseInterfaceLanguage(page,'en');await check('b',true);const length=await page.evaluate(()=>history.length);
   await page.goBack();await check('a',true);await page.goForward();await check('b',true);assert.equal(await page.evaluate(()=>history.length),length);
   const article=page.locator('.article-route');assert.equal(await article.locator('h1').getAttribute('lang'),'en');
   await page.getByRole('button',{name:'Bookmark',exact:true}).click();await page.waitForURL(u=>u.pathname==='/login');assert.equal(new URL(page.url()).searchParams.get('redirect'),'/en/article/b');await page.waitForFunction(()=>document.documentElement.lang==='en'&&document.title==='Sign in · mooncci');await page.waitForFunction(()=>{const input=document.querySelector('input[type=email]');if(!input)return false;input.checkValidity();return input.validity.customError&&input.validationMessage==='Fill out this field.';});await page.goBack();await check('b',true);
   await page.setViewportSize({width:375,height:812});await page.screenshot({path:'.cache/public-history-'+name+'-375.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile horizontal overflow');
   assert.deepEqual(errors,[]);records.push({engine:name,realApp:true,case:'A→B→English→Back→Forward, same history length, actual body language, bookmark redirect, 375px overflow',pass:true,nativeValidationEnglish:true,realPrivateMetadataEnglish:true,analytics:views});await context.close();
  }finally{await browser.close();}
 }}finally{await server.close();await new Promise(resolve=>metadataServer.close(resolve));await fs.writeFile('.cache/public-history-results.json',JSON.stringify(records,null,2));}
 console.log(JSON.stringify(records,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
