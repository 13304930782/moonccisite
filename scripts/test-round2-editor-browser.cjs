const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function installEditorFixture(page){
 const state={saves:[],uploads:0,searches:[],failSave:false,failUpload:true,failMediaSave:true,mediaWrites:[],outbound:[]};
 let draft={id:'bbbb1111-1111-4111-8111-111111111111',version:1,post_id:null,payload:{title:'隔离的交互验收稿',content:Array.from({length:55},(_,i)=>`第 ${i+1} 行保留编辑位置和原始内容。`).join('\n\n'),summary:'这是一份完全隔离的本地交互验收稿，不会写入真实网站。',summary_mode:'manual',category:'测试',tags:['原标签','顺序保留'],cover_image:'',cover_crop:null},workflow:{state:'draft'},updated_at:'2026-10-16T00:00:00Z'};
 let item={filename:'fixture.svg',display_name:'隔离图片',alt_text:'原说明',url:'/__round2-image.svg',size:100,size_text:'100 B',uploaded_at:'2026-10-01',status:'active',ext:'.svg',width:640,height:400};
 await page.route('**/*',route=>{const host=new URL(route.request().url()).hostname;if(!['127.0.0.1','localhost'].includes(host)){state.outbound.push(route.request().url());return route.abort('blockedbyclient');}return route.continue();});
 await page.route('**/__round2-image.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="slategray"/><circle cx="320" cy="200" r="110" fill="lightgray"/></svg>'}));
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),p=url.pathname,method=request.method();let json={};
  if(p==='/api/auth/session')json={user:{id:1,role:'owner',username:'fixture',display_name:'隔离验收'}};
  else if(p==='/api/site-settings')json={brand:{},weather:{enabled:false},site_title:'本地验收'};
  else if(p==='/api/publishing/config')json={enabled:true};
  else if(p==='/api/article-seo/status')json={enabled:false};
  else if(p==='/api/upload/media'){state.searches.push(url.searchParams.get('q'));await delay(url.searchParams.get('q')==='慢' ? 1100:250);json={items:[item],total:1,page:1,pageSize:50};}
  else if(p==='/api/upload/image'){state.uploads++;await delay(500);if(state.failUpload)return route.fulfill({status:400,json:{message:'隔离适配器：请重试上传'}});json={url:'/__round2-image.svg'};}
  else if(p==='/api/upload/media/fixture.svg'&&method==='PUT'){state.mediaWrites.push(request.postDataJSON());await delay(450);if(state.failMediaSave)return route.fulfill({status:400,json:{message:'隔离适配器：显示信息保存失败'}});item={...item,...request.postDataJSON()};json=item;}
  else if(p.endsWith('/revisions'))json={items:[],total:0};
  else if(p.startsWith('/api/article-drafts')){
   if(method==='PUT'){const body=request.postDataJSON();state.saves.push(body);await delay(650);if(state.failSave)return route.fulfill({status:400,json:{message:'隔离适配器：保存失败，请重试'}});draft={...draft,version:draft.version+1,payload:body.payload,updated_at:new Date().toISOString()};}
   else assert.equal(method,'GET','this fixture never publishes or deletes any article');json=draft;
  }
  await route.fulfill({json});
 });
 return state;
}
async function runEditorFlow(page,{baseline=false,origin=process.env.INTERACTION_ORIGIN||'http://127.0.0.1:5245'}={}){
 const state=await installEditorFixture(page),result={baseline};
 page.__round2Editor={state,result};
 await page.goto(origin+'/admin/write?draft=bbbb1111-1111-4111-8111-111111111111');
 const source=page.getByRole('textbox',{name:'Markdown 正文',exact:true});await source.waitFor();const originalLock=await page.evaluate(()=>({pointerEvents:document.body.style.pointerEvents,overflow:document.body.style.overflow}));
 async function manualSave(){const save=page.getByRole('button',{name:'保存草稿',exact:true});if(await save.count())await save.click();else{await page.getByRole('button',{name:'更多文章操作',exact:true}).click();await page.getByRole('menuitem',{name:'保存草稿',exact:true}).click();}}
 await source.evaluate(el=>{el.dataset.round2Original='yes';el.focus();el.setSelectionRange(9,9);el.scrollTop=200;});
 const before=await source.evaluate(el=>({start:el.selectionStart,end:el.selectionEnd,scroll:el.scrollTop}));
 await page.getByRole('button',{name:'阅读预览',exact:true}).click();await page.locator('.article-editor-preview').waitFor();await delay(350);
 await page.getByRole('button',{name:'Markdown 源码',exact:true}).click();await source.waitFor();
 const after=await source.evaluate(el=>({same:el.dataset.round2Original==='yes',start:el.selectionStart,end:el.selectionEnd,scroll:el.scrollTop}));
 result.editorRestored={before,after};if(!baseline){assert(after.same);assert.equal(after.start,before.start);assert.equal(after.end,before.end);assert.equal(after.scroll,before.scroll);}
 await source.evaluate(el=>{el.focus();el.setSelectionRange(9,9);});
 await page.getByRole('button',{name:'插入图片',exact:true}).click();
 if(await page.getByRole('menuitem',{name:'从媒体库选择',exact:true}).count())await page.getByRole('menuitem',{name:'从媒体库选择',exact:true}).click();else await page.getByRole('button',{name:'从媒体库选择',exact:true}).click();
 const picker=page.getByRole('dialog',{name:'选择图片',exact:true});await picker.waitFor();await picker.getByRole('button',{name:/隔离图片/}).click();await picker.getByRole('button',{name:'使用图片',exact:true}).click();await picker.waitFor({state:'hidden'});
 assert((await source.inputValue()).slice(9).startsWith('!['));await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Markdown 正文');result.imageInsertedAtSelection=true;
 const isolatedFile={name:'isolated.png',mimeType:'image/png',buffer:Buffer.from('isolated local adapter bytes')};
 const sourceTools=page.locator('.article-source-toolbar');await sourceTools.getByLabel('上传正文图片',{exact:true}).setInputFiles(isolatedFile);await page.getByRole('alert').filter({hasText:'隔离适配器：请重试上传'}).waitFor();const bodyRetry=page.getByRole('button',{name:'重试正文图片',exact:true});result.bodyRetryAvailable=await bodyRetry.count()>0;state.failUpload=false;
 if(result.bodyRetryAvailable)await bodyRetry.click();else await sourceTools.getByLabel('上传正文图片',{exact:true}).setInputFiles(isolatedFile);await page.getByRole('button',{name:'插入图片',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('.article-source-toolbar .article-image-trigger')?.disabled);if(!baseline)assert(result.bodyRetryAvailable);result.bodyUploadRetried=true;
 const title=page.getByRole('textbox',{name:'标题',exact:true});await title.fill('保存开始时的标题');await manualSave();await page.waitForFunction(()=>document.querySelector('.writing-save-state')?.getAttribute('data-state')==='saving');await title.fill('保存期间继续输入的标题');
 await page.waitForFunction(()=>document.querySelector('.writing-save-state')?.getAttribute('data-state')!=='saving');assert.equal(await title.inputValue(),'保存期间继续输入的标题');result.lateInputPreserved=true;
 state.failSave=true;await manualSave();await page.locator('.article-workspace-notice[role=alert]').filter({hasText:'隔离适配器：保存失败'}).waitFor();await page.waitForFunction(()=>{const retry=[...document.querySelectorAll('.article-workspace-notice button')].find(button=>button.textContent==='重试保存');return retry&&!retry.disabled;});assert.equal(await title.inputValue(),'保存期间继续输入的标题');
 const writesAfterFailure=state.saves.length;await delay(350);assert.equal(state.saves.length,writesAfterFailure);state.failSave=false;await page.getByRole('button',{name:'重试保存',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.writing-save-state')?.getAttribute('data-state')==='saved');result.saveFailureRetainedAndRetried=true;
 // A full check uses the real iframe and retained editor, never a demo component.
 const writingScroll=await page.locator('.writing-workspace').evaluate(el=>{const scroll=el.closest('.admin-main')||document.scrollingElement;scroll.scrollTop=350;return scroll.scrollTop;});
 await page.getByRole('button',{name:'发布',exact:true}).evaluate(el=>el.addEventListener('pointerdown',()=>{window.__round2PublishOrigin=(el.closest('.admin-main')||document.scrollingElement).scrollTop;},{once:true}));
 await page.getByRole('button',{name:'发布',exact:true}).click();await page.getByRole('heading',{name:'发布前检查',exact:true}).waitFor();await page.getByRole('button',{name:'运行发布前检查',exact:true}).click();await page.getByRole('heading',{name:'检查通过，可以继续'}).waitFor();await page.getByRole('button',{name:'返回编辑',exact:true}).click();await source.waitFor();assert((await source.inputValue()).includes('](</__round2-image.svg>)'));result.previewCheckReturned=true;
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));result.fullPreviewScroll={requestedByFixture:writingScroll,before:await page.evaluate(()=>window.__round2PublishOrigin),after:await page.locator('.writing-workspace').evaluate(el=>(el.closest('.admin-main')||document.scrollingElement).scrollTop)};
 if(!baseline)assert.equal(result.fullPreviewScroll.after,result.fullPreviewScroll.before,'return from publication preview must restore the editing viewport');
 // Settings/history keep Radix focus and scroll ownership through rapid reversals.
 const mobile=page.viewportSize().width<768;
 async function settings(){if(mobile){await page.getByRole('button',{name:'更多文章操作',exact:true}).click();await page.getByRole('menuitem',{name:'文章设置',exact:true}).click();}else{const close=page.getByRole('button',{name:'收起文章设置',exact:true});if(await close.count())await close.click();await page.getByRole('button',{name:'文章设置',exact:true}).click();}}
 const historyOrigin=mobile?page.getByRole('button',{name:'更多文章操作',exact:true}):page.getByRole('button',{name:'修订历史',exact:true}),historyPoint=await historyOrigin.boundingBox();
 if(mobile){await historyOrigin.click();await page.getByRole('menuitem',{name:'修订历史',exact:true}).click();}else await historyOrigin.click();
 const history=page.getByRole('dialog',{name:'修订历史',exact:true});await history.waitFor();result.historyMotion=await history.evaluate(el=>{const style=getComputedStyle(el);return {name:style.animationName,duration:style.animationDuration,transform:style.transform,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,managed:el.dataset.motionSurfaceActive==='true'};});if(!baseline){if(result.historyMotion.managed){assert.equal(result.historyMotion.name,'none');assert.notEqual(result.historyMotion.transform,'none','managed surface must use its real spatial entry');}else{assert.equal(result.historyMotion.transform,'none');assert.equal(result.historyMotion.name,result.historyMotion.reduced?'none':'mooncci-fade');}}await delay(60);await page.keyboard.press('Escape');
 if(!baseline){await page.mouse.click(historyPoint.x+historyPoint.width/2,historyPoint.y+historyPoint.height/2);if(mobile)await page.locator('[role=menu][data-state=open]').getByRole('menuitem',{name:'修订历史',exact:true}).waitFor({timeout:3000});else await page.locator('.writing-history-dialog[data-state=open]').waitFor({timeout:3000});result.historyNativeReopen=true;await page.keyboard.press('Escape');}
 await history.waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='更多文章操作'||document.activeElement?.textContent==='修订历史');result.historyClosedToTrigger=true;
 await settings();state.failUpload=true;await page.getByLabel('上传封面',{exact:true}).setInputFiles(isolatedFile);await delay(650);const coverArea=mobile?page.getByRole('dialog',{name:'文章设置',exact:true}):page.getByRole('complementary',{name:'文章设置',exact:true});result.coverErrorVisible=await coverArea.getByRole('alert').filter({hasText:'隔离适配器：请重试上传'}).count()>0;const coverRetry=coverArea.getByRole('button',{name:'重试上传封面',exact:true});result.coverRetryAvailable=await coverRetry.count()>0;state.failUpload=false;
 if(result.coverRetryAvailable)await coverRetry.click();else await page.getByLabel('上传封面',{exact:true}).setInputFiles(isolatedFile);await coverArea.locator('.writing-cover-preview').waitFor();if(!baseline){assert(result.coverErrorVisible);assert(result.coverRetryAvailable);}result.coverUploadRetried=true;
 if(mobile){await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'文章设置',exact:true}).waitFor({state:'hidden'});}
 for(let i=0;i<3;i++){await settings();if(mobile){await page.getByRole('dialog',{name:'文章设置',exact:true}).waitFor();await delay(50);await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'文章设置',exact:true}).waitFor({state:'hidden'});}else await delay(100);}
 if(!mobile){const close=page.getByRole('button',{name:'收起文章设置',exact:true});if(await close.count())await close.click();}
 await delay(200);result.settingsLock=await page.evaluate(()=>({pointerEvents:document.body.style.pointerEvents,overflow:document.body.style.overflow}));assert.deepEqual(result.settingsLock,originalLock);result.settingsNoResidualLock=true;
 await title.fill('离开拦截后保留的标题');await page.getByRole('button',{name:'返回文章管理',exact:true}).click();const leave=page.getByRole('alertdialog',{name:'请确认操作',exact:true});await leave.waitFor();await leave.getByRole('button',{name:'取消',exact:true}).click();await leave.waitFor({state:'hidden'});assert(new URL(page.url()).pathname==='/admin/write');assert.equal(await title.inputValue(),'离开拦截后保留的标题');result.unsavedLeaveCancelled=true;
 await manualSave();await page.waitForFunction(()=>document.querySelector('.writing-save-state')?.getAttribute('data-state')==='saved');
 await page.goto(origin+'/admin/media');await page.getByRole('button',{name:'隔离图片',exact:true}).waitFor();
 const search=page.getByRole('textbox',{name:'搜索媒体文件',exact:true});const prior=state.searches.length;
 await search.dispatchEvent('compositionstart');await search.fill('候选');await delay(450);result.imeRequests=state.searches.length-prior;if(!baseline)assert.equal(result.imeRequests,0);
 await search.dispatchEvent('compositionend',{data:'候选'});await delay(650);
 await search.fill('慢');await delay(340);result.gridKeptDuringSlowSearch=await page.getByRole('button',{name:'隔离图片',exact:true}).count()>0;if(!baseline)assert(result.gridKeptDuringSlowSearch);
 await search.fill('最新');await delay(1400);assert.equal(await search.inputValue(),'最新');await page.getByRole('button',{name:'隔离图片',exact:true}).click();
 const detail=page.getByRole('dialog',{name:'隔离图片',exact:true});await page.getByLabel('Alt 文本',{exact:true}).fill('失败后保留的图片说明');await detail.getByRole('button',{name:'保存显示信息',exact:true}).click();await detail.getByRole('alert').waitFor();assert.equal(await page.getByLabel('Alt 文本',{exact:true}).inputValue(),'失败后保留的图片说明');state.failMediaSave=false;await detail.getByRole('button',{name:'保存显示信息',exact:true}).click();await page.getByText('媒体信息已保存',{exact:true}).waitFor();await page.keyboard.press('Escape');await detail.waitFor({state:'hidden'});result.mediaDetailsFailureRetried=true;
 state.failUpload=true;const mediaUploadStart=state.uploads;await page.getByLabel('上传图片文件',{exact:true}).setInputFiles(isolatedFile);await page.getByRole('alert').filter({hasText:'隔离适配器：请重试上传'}).waitFor();const retry=page.getByRole('button',{name:'重试上传',exact:true});result.uploadRetryAvailable=await retry.count()>0;state.failUpload=false;
 if(result.uploadRetryAvailable)await retry.click();else await page.getByLabel('上传图片文件',{exact:true}).setInputFiles(isolatedFile);
 await page.getByRole('button',{name:'上传图片',exact:true}).waitFor({state:'visible'});await delay(1000);assert.equal(state.uploads-mediaUploadStart,2);if(!baseline)assert(result.uploadRetryAvailable);result.onlyTwoExplicitUploadAttempts=true;
 result.horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(result.horizontalOverflow,false);result.productionWrites=0;result.passed=true;return result;
}
module.exports={installEditorFixture,runEditorFlow};
if(require.main===module)(async()=>{
 const output=path.resolve(process.env.INTERACTION_OUTPUT||'.cache/interaction-round2/editor'),width=Number(process.env.INTERACTION_WIDTH||1440),baseline=process.env.INTERACTION_BASELINE==='1';fs.mkdirSync(output,{recursive:true});let server,browser,context,page;const errors=[];
 try{if(!process.env.INTERACTION_ORIGIN)server=await(await import('vite')).preview({preview:{host:'127.0.0.1',port:5245,strictPort:true}});
  browser=await(process.env.PLAYWRIGHT_BROWSER==='webkit'?webkit:chromium).launch(process.env.PLAYWRIGHT_BROWSER==='webkit'?{}:{channel:'chrome'});context=await browser.newContext({baseURL:process.env.INTERACTION_ORIGIN||'http://127.0.0.1:5245',viewport:{width,height:900},hasTouch:width<768,isMobile:width<768,reducedMotion:process.env.INTERACTION_REDUCE==='1'?'reduce':'no-preference',recordVideo:{dir:output,size:{width,height:900}}});await context.addInitScript(()=>{try{localStorage.setItem('mooncci-theme','light');}catch{}});page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const result=await runEditorFlow(page,{baseline});result.pageerrors=errors;assert.deepEqual(errors,[]);await context.close();await page.video().saveAs(path.join(output,`editor-${baseline?'before':'after'}-${width}-${process.env.INTERACTION_REDUCE==='1'?'reduce':'motion'}.webm`));fs.writeFileSync(path.join(output,`result-${baseline?'before':'after'}-${width}-${process.env.INTERACTION_REDUCE==='1'?'reduce':'motion'}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }catch(error){const dom=page&&!page.isClosed()?await page.evaluate(()=>({body:{pointerEvents:document.body.style.pointerEvents,overflow:document.body.style.overflow},layers:[...document.querySelectorAll('[role=dialog],[role=alertdialog],[role=menu],[data-slot$="overlay"]')].map(el=>({role:el.getAttribute('role'),state:el.getAttribute('data-state'),class:el.className})),focus:document.activeElement?.getAttribute('aria-label')})).catch(()=>null):null;fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:error.stack,errors,observed:page?.__round2Editor,dom},null,2));console.error(error);process.exitCode=1;if(page?.video()){await context?.close();await page.video().saveAs(path.join(output,`editor-${baseline?'before':'after'}-${width}-failed.webm`));}}
 finally{await context?.close();await browser?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));}
})();
