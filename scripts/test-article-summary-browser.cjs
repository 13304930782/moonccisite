const assert=require('node:assert/strict'),fs=require('node:fs');const {chromium}=require('playwright');
(async()=>{const {preview}=await import('vite');const server=await preview({preview:{host:'127.0.0.1',port:4199,strictPort:true}}),browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));fs.mkdirSync('.cache/summary-qa',{recursive:true});
 let config={enabled:false,model:'deepseek-flash',has_key:false},savedKey='',generations=0,fail=false;
 let draft={id:'aaaa1111-1111-4111-8111-111111111111',version:1,payload:{title:'C 语言数组与排序',content:'一、数组定义\n\n下面记录整数数组的声明方式、循环输入和冒泡排序的基本练习。',summary:'',tags:['C']},workflow:{state:'draft'}};
 const summary='介绍 C 语言数组声明、使用循环读入数据与遍历输出的基本写法，结合比较和交换相邻元素的冒泡排序示例，记录数组下标、循环边界以及整数数组处理的课堂练习。';
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',async r=>{const url=new URL(r.request().url()),p=url.pathname,m=r.request().method();let body={};
  if(p==='/api/auth/session')body={user:{id:1,username:'mooncci',role:'owner'}};
  else if(p==='/api/publishing/config')body={enabled:true};
  else if(p==='/api/article-seo/status'||p==='/api/article-seo/settings'){if(m==='PUT'){const input=r.request().postDataJSON();savedKey=input.api_key;config={enabled:input.enabled,model:input.model,has_key:true};}body=config;}
  else if(p==='/api/article-seo/generate'){generations++;if(fail)return r.fulfill({status:503,json:{message:'DeepSeek 余额不足，请站长充值。'}});body={summary,summary_mode:'ai',summary_receipt:'a'.repeat(64)};}
  else if(p.endsWith('/revisions'))body={items:[],total:0};
  else if(p==='/api/article-drafts'||p.startsWith('/api/article-drafts/')){if(m==='PUT')draft={...draft,version:draft.version+1,payload:r.request().postDataJSON().payload};body=draft;}
  else if(p==='/api/settings/site')body={brand:{},hero:{},profile:{},footer:{}};
  await r.fulfill({json:body});
 });
 await page.goto('http://127.0.0.1:4199/admin/ai-settings');await page.getByRole('heading',{name:'AI 文章简介',exact:true}).waitFor();await page.getByLabel('DeepSeek API Key', {exact:true}).fill('sk-browser-fixture-not-a-real-key');await page.getByLabel('启用自动总结').check();await page.getByRole('button',{name:'保存 AI 设置',exact:true}).click();await page.getByText(/设置已保存/).waitFor();assert.equal(savedKey,'sk-browser-fixture-not-a-real-key');assert.equal(await page.getByLabel('DeepSeek API Key',{exact:true}).inputValue(),'');
 for(const width of [1280,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'settings overflow '+width);await page.screenshot({path:'.cache/summary-qa/settings-'+width+'.png',fullPage:true});}
 await page.setViewportSize({width:1280,height:900});await page.goto('http://127.0.0.1:4199/admin/write?draft='+draft.id);await page.getByRole('textbox',{name:'标题',exact:true}).waitFor();await page.getByRole('button',{name:'预览并发布',exact:true}).click();await page.getByRole('heading',{name:'搜索描述预览',exact:true}).waitFor();assert.equal(generations,1);await page.getByRole('button',{name:'运行发布前检查',exact:true}).click();await page.getByRole('heading',{name:'检查通过，可以继续',exact:true}).waitFor();await page.screenshot({path:'.cache/summary-qa/preview.png',fullPage:true});
 await page.getByRole('button',{name:'返回编辑',exact:true}).click();await page.getByRole('textbox',{name:'标题',exact:true}).fill('数组正文更新');fail=true;await page.getByRole('button',{name:'预览并发布',exact:true}).click();await page.getByRole('alert').filter({hasText:'DeepSeek 余额不足'}).waitFor();assert.equal(await page.getByRole('heading',{name:'搜索描述预览',exact:true}).count(),0);
 await page.getByText('文章设置',{exact:true}).click();await page.locator('#article-summary').fill('手写简介准确说明数组声明、遍历和排序练习，作者编辑后应保留。');const count=generations;await page.getByRole('button',{name:'预览并发布',exact:true}).click();await page.getByRole('heading',{name:'搜索描述预览',exact:true}).waitFor();assert.equal(generations,count);
 assert.deepEqual(errors,[]);console.log('PASS: owner configuration, password clearing, desktop/mobile layout, AI preview, provider failure and manual override; mocked local API only.');
 }finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
