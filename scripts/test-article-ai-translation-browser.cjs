const assert=require('node:assert/strict');
const {chromium}=require('playwright');

(async()=>{
 const server=await(await import('vite')).createServer({server:{host:'127.0.0.1',port:4267,strictPort:true,hmr:false},logLevel:'error'});await server.listen();
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 try{
  for(const scenario of ['empty','existing','typing','discard','discard-recreated','source-dirty','locked','stream-error','stream-success','compare']){
   const page=await browser.newPage({viewport:{width:1440,height:900}}),calls=[];let release;
   const pending=new Promise(resolve=>{release=resolve});
   const zh={id:'11111111-1111-4111-8111-111111111111',locale:'zh-CN',version:1,post_id:42,base_version:3,post_status:'published',dirty:scenario==='source-dirty'?1:0,payload:{title:'中文标题',summary:'中文简介',content:'中文正文',slug:'article',category:'',tags:[],summary_mode:'manual'}};
   const en={id:'22222222-2222-4222-8222-222222222222',locale:'en',version:1,post_id:42,post_status:'published',translation_status:['existing','compare'].includes(scenario)?'published':'draft',workflow:{state:scenario==='locked'?'submitted':'draft'},payload:{...zh.payload,title:['existing','compare'].includes(scenario)?'Existing title':'',summary:'',content:['existing','compare'].includes(scenario)?'Existing text':''}}; let removed=false;
   await page.route('**/api/**',async r=>{const p=new URL(r.request().url()).pathname,m=r.request().method();let data={};
    if(p==='/api/auth/session')data={user:{id:1,role:'owner',username:'tester'}};
    else if(p==='/api/settings/site')data={brand:{},hero:{},footer:{},weather:{enabled:false}};
    else if(p==='/api/publishing/config')data={enabled:false};
    else if(p==='/api/article-seo/status')data={enabled:true,has_key:true};
    else if(p==='/api/article-seo/translate'){calls.push(r.request().postDataJSON());if(scenario==='stream-success')return r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'progress',completed:1,total:1,items:[{field:'content',translated:'Translated first paragraph'}]})+'\n'+JSON.stringify({type:'complete',result:{title:'Translated title',summary:'Translated summary',content:'Translated body'}})+'\n'});if(scenario==='stream-error')return r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'progress',completed:1,total:2,items:[{field:'content',translated:'Translated first paragraph'}]})+'\n'+JSON.stringify({type:'error',message:'Translation failed'})+'\n'});if(scenario==='typing'||scenario==='discard')await pending;data={title:'Translated title',summary:'Translated summary',content:'Translated body'};}
    else if(p==='/api/article-drafts'&&m==='POST'){if(removed){en.id=r.request().postDataJSON().id;en.payload={...en.payload,title:'',summary:'',content:''};removed=false;}data=r.request().postDataJSON().locale==='en'?en:zh;}
    else if(p.startsWith('/api/article-drafts/')){if(removed&&m==='GET')return r.fulfill({status:404,json:{message:'not found'}});const d=p.includes(en.id)?en:zh;if(m==='PUT'){d.payload=r.request().postDataJSON().payload;d.version++;}if(m==='DELETE'){d.version++;if(scenario==='discard-recreated')removed=true;}data=d;}
    return r.fulfill({json:data});
   });
   await page.goto('http://127.0.0.1:4267/admin/posts/42/edit');await page.locator('#article-title').waitFor();
   await page.locator('.writing-content-language-top [role=group] button').nth(1).click();
   if(scenario==='empty'||scenario==='stream-success'){
    await page.waitForFunction(()=>document.querySelector('#article-title')?.value==='Translated title');
    assert.equal(calls.length,1);assert.equal(calls[0].payload.content,'中文正文');assert.equal(calls[0].sourcePostId,42);assert.equal(calls[0].sourceBaseVersion,3);
   }else if(scenario==='compare'){
    await page.waitForFunction(()=>document.querySelector('#article-title')?.value==='Existing title');
    await page.getByRole('button',{name:'中英文对照'}).click();await page.locator('.bilingual-compare').waitFor();
    assert.match(await page.locator('.bilingual-compare-column').first().innerText(),/中文标题/);for(const width of [1440,1280,1024,768]){await page.setViewportSize({width,height:900});const boxes=await page.locator('.writing-content-language-top,.writing-topbar-actions').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}}));assert.ok(boxes.length===2&&(boxes[0].right<=boxes[1].left||boxes[1].right<=boxes[0].left||boxes[0].bottom<=boxes[1].top||boxes[1].bottom<=boxes[0].top),'language controls must not overlap at '+width)}await page.screenshot({path:'.cache/bilingual-compare-desktop.png'});await page.setViewportSize({width:375,height:812});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile compare must not overflow');await page.screenshot({path:'.cache/bilingual-compare-mobile.png'});await page.setViewportSize({width:1440,height:900});
    await page.locator('.bilingual-compare-title textarea').fill('Edited English');await page.locator('.bilingual-compare [data-markdown-editor]').fill('Edited English body');
    await page.getByRole('button',{name:'中英文对照'}).click();assert.equal(await page.locator('#article-title').inputValue(),'Edited English');assert.equal(await page.locator('.writing-editor-fields [data-markdown-editor]').inputValue(),'Edited English body');
   }else if(scenario==='existing'){
    await page.waitForFunction(()=>document.querySelector('#article-title')?.value==='Existing title');
    await page.waitForTimeout(800);assert.equal(calls.length,0);
   }else if(scenario==='typing'){
    await page.getByText('正在用 DeepSeek 翻译中文文章，完成后请检查译文。').waitFor();
    await page.getByRole('button',{name:'从空白开始'}).click();await page.locator('#article-title').fill('My own English title');release();
    await page.waitForTimeout(300);assert.equal(await page.locator('#article-title').inputValue(),'My own English title');
   }else if(scenario==='discard'){
    await page.getByText('正在用 DeepSeek 翻译中文文章，完成后请检查译文。').waitFor();
    await page.getByRole('button',{name:'更多文章操作',exact:true}).click();await page.getByRole('menuitem',{name:'放弃英文版未发布修改',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'取消'}).click();
    await page.getByRole('button',{name:'更多文章操作',exact:true}).click();await page.getByRole('menuitem',{name:'放弃英文版未发布修改',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'确认继续'}).click();
    await page.getByText('已放弃英文版未发布修改。').first().waitFor();release();await page.getByText('翻译期间文章已有变化，未覆盖现有内容。').waitFor();assert.equal(await page.locator('#article-title').inputValue(),'');
    await page.getByRole('button',{name:'从空白开始'}).click();await page.locator('#article-title').click({timeout:3000});assert.equal(await page.evaluate(()=>getComputedStyle(document.body).pointerEvents),'auto','closing confirmation must not leave the page unclickable');
   }else if(scenario==='discard-recreated'){
    await page.waitForFunction(()=>document.querySelector('#article-title')?.value==='Translated title');
    await page.getByRole('button',{name:'更多文章操作',exact:true}).click();await page.getByRole('menuitem',{name:'放弃英文版未发布修改',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'确认继续'}).click();
    await page.getByText('已放弃英文版未发布修改。').first().waitFor();await page.waitForTimeout(700);assert.equal(calls.length,1,'discarded translation must not be regenerated');assert.equal(await page.locator('#article-title').inputValue(),'');await page.getByRole('button',{name:'从空白开始'}).click();await page.locator('#article-title').click({timeout:3000});
   }else if(scenario==='stream-error'){await page.getByText('Translated first paragraph').waitFor();await page.getByText('Translation failed').waitFor();assert.equal(await page.locator('#article-title').inputValue(),'');}
   else if(scenario==='source-dirty'){await page.getByText('中文版有未发布修改，请先发布中文版，再生成英文译文。').waitFor();assert.equal(calls.length,0);}
   else{await page.waitForTimeout(800);assert.equal(calls.length,0);}
   await page.close();
  }
  console.log('PASS: empty English auto-translates; existing or newly typed English is never overwritten.');
 }finally{await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
