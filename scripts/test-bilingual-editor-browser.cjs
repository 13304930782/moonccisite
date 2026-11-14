const {chooseInterfaceLanguage}=require('./fixtures/language-menu.cjs');
const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const server=await(await import('vite')).createServer({server:{host:'127.0.0.1',port:4266,strictPort:true,hmr:false,fs:{allow:[process.cwd(),require('node:path').resolve(require.resolve('vite'),'../../../..')]},watch:{ignored:['**/.cache/**','**/outputs/**']}}});await server.listen();
 const browser=await chromium.launch((process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}));
 try{
  const page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:1000}}),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  let zhId='11111111-1111-4111-8111-111111111111',enId='22222222-2222-4222-8222-222222222222';
  const drafts={};drafts[zhId]={id:zhId,locale:'zh-CN',version:1,post_id:42,post_status:'published',payload:{title:'中文标题',content:'## 中文正文\n\n原文内容',slug:'one-article',summary:'中文简介',summary_mode:'manual',category:'技术',tags:[]},workflow:{state:'draft'}};drafts[enId]={id:enId,locale:'en',source_changed:true,current_source_hash:'a'.repeat(64),version:1,post_id:42,post_status:'published',payload:{...drafts[zhId].payload,title:'English title',content:'## English body\n\nOriginal English',summary:'English summary'},workflow:{state:'draft'}};
  let delaySave=null,failSave=false,failDiscard=false,identityCalls=0;const publishes=[];
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.route('**/api/**',async r=>{
   const url=new URL(r.request().url()),p=url.pathname,m=r.request().method();let json={};
   if(p==='/api/auth/session')json={user:{id:1,role:'owner',username:'mooncci',ui_locale:'zh-CN'}};
   else if(p==='/api/settings/site')json={brand:{},weather:{enabled:false}};
   else if(p==='/api/publishing/config')json={enabled:true};
   else if(p.endsWith('/revisions'))json={items:[],total:0};
   else if(p==='/api/article-seo/status')json={enabled:false};
   else if(p==='/api/article-drafts'&&m==='POST'){const input=r.request().postDataJSON();json=drafts[input.locale==='en'?enId:zhId];}
   else if(p.endsWith('/identity')){identityCalls++;const d=drafts[p.split('/')[3]];assert.equal(d.payload.slug,'');d.post_id ||= 84;drafts[enId].post_id=d.post_id;json=d;}
   else if(p.startsWith('/api/article-drafts/')){const id=p.split('/')[3],d=drafts[id];assert.ok(d,p);if(m==='DELETE'&&failDiscard)return r.abort();if(m==='PUT'){const b=r.request().postDataJSON();assert.equal(b.locale,d.locale);writes.push({locale:b.locale,payload:b.payload,reviewed_source_hash:b.reviewed_source_hash});if(delaySave){const wait=delaySave;delaySave=null;await wait;}if(failSave)return r.fulfill({status:503,json:{message:'Isolated save failure'}});drafts[id]={...d,version:d.version+1,payload:b.payload,...(b.reviewed_source_hash?{source_changed:false}:{})};}else if(m==='POST'&&p.endsWith('/publish')){const b=r.request().postDataJSON();assert.equal(b.locale,d.locale);assert.equal(b.version,d.version);publishes.push({id,locale:b.locale,payload:d.payload});drafts[id]={...d,translation_status:'published'};}json=drafts[id];}
   return r.fulfill({json});
  });
  await page.goto('http://127.0.0.1:4266/admin/write?draft='+zhId);const title=page.locator('#article-title');await title.waitFor();await page.locator('[data-markdown-editor]').waitFor();
  assert.match(await page.locator('.writing-version-state').innerText(),/已发布/,'Chinese version should show the published state');
  await page.waitForTimeout(2300);assert.equal(writes.length,0,'opening a published article must not save changes');
  await page.getByRole('button',{name:'更多文章操作',exact:true}).click();assert.equal(await page.getByRole('menuitem',{name:'放弃中文版未发布修改',exact:true}).getAttribute('data-disabled'),'');await page.keyboard.press('Escape');
  await title.fill('中文未保存输入');await page.locator('[data-markdown-editor]').fill('## 中文修改\n\n保持原文');
  assert.match(await page.locator('.writing-version-state').innerText(),/有未发布修改/,'unpublished edits must not appear as published');
  await page.locator('[data-markdown-editor]').evaluate(el=>el.setSelectionRange(3,8));
  const editorNode=await title.elementHandle();await chooseInterfaceLanguage(page,'en');await page.waitForFunction(()=>document.documentElement.lang==='en');assert.equal(await title.inputValue(),'中文未保存输入');assert.equal(await page.locator('[data-markdown-editor]').inputValue(),'## 中文修改\n\n保持原文');assert.equal(await editorNode.evaluate(el=>el.isConnected),true,'UI language must not remount the editor');assert.deepEqual(await page.locator('[data-markdown-editor]').evaluate(el=>[el.selectionStart,el.selectionEnd]),[3,8],'UI switch retains source selection');
  await page.locator('.writing-save-trigger').click();await page.waitForFunction(()=>document.querySelector('.writing-save-state')?.getAttribute('data-state')==='saved');
  await page.locator('.writing-content-language [role=group] button').nth(1).click();await page.waitForFunction(()=>document.querySelector('#article-title')?.value==='English title');
  await title.fill('English unsaved input');await page.locator('[data-markdown-editor]').fill('## English changed\n\nKeep English');
  failSave=true;await page.locator('.writing-save-trigger').click();await page.waitForFunction(()=>document.querySelector('.writing-save-state')?.getAttribute('data-state')==='error');await page.locator('.article-workspace-notice[role=alert]').waitFor();assert.equal(await title.inputValue(),'English unsaved input');
  await chooseInterfaceLanguage(page,'zh-CN');await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');assert.equal(await title.inputValue(),'English unsaved input');assert.equal(await page.locator('.writing-content-language [role=group] button').nth(1).getAttribute('aria-pressed'),'true');
  failSave=false;await page.locator('.writing-save-trigger').click();await page.waitForFunction(()=>document.querySelector('.writing-save-state')?.getAttribute('data-state')==='saved');assert.equal(drafts[enId].source_changed,true,'ordinary saving must not silently mark a changed original reviewed');await page.getByRole('button',{name:'确认已校对原文',exact:true}).click();await page.getByRole('button',{name:'确认已校对原文',exact:true}).waitFor({state:'detached'});assert.equal(writes.at(-1).reviewed_source_hash,'a'.repeat(64));await page.locator('.writing-content-language [role=group] button').nth(0).click();await page.waitForFunction(()=>document.querySelector('#article-title')?.value==='中文未保存输入');assert.equal(await page.locator('[data-markdown-editor]').inputValue(),'## 中文修改\n\n保持原文');
  assert.ok(writes.some(w=>w.locale==='en'&&w.payload.content.startsWith('## English')));assert.ok(writes.some(w=>w.locale==='zh-CN'&&w.payload.content.startsWith('## 中文')));assert.ok(!writes.some(w=>w.locale==='en'&&w.payload.content.startsWith('## 中文')));assert.deepEqual(errors,[]);
  await page.getByRole('button',{name:'富文本编辑',exact:true}).click();await page.locator('.tiptap.ProseMirror').waitFor();
  const editor=page.locator('.tiptap.ProseMirror');const contentBefore=await editor.innerText();await page.getByRole('button',{name:'加粗',exact:true}).first().waitFor();
  await chooseInterfaceLanguage(page,'en');await page.waitForFunction(()=>document.documentElement.lang==='en');await page.getByRole('button',{name:'Bold',exact:true}).first().waitFor();assert.equal(await editor.innerText(),contentBefore);assert.deepEqual(errors,[]);
  const slugAlignment=await page.locator('.writing-slug').evaluate(el=>{const prefix=el.querySelector('span'),input=el.querySelector('input'),a=prefix.getBoundingClientRect(),b=input.getBoundingClientRect();return {difference:Math.abs((a.top+a.height/2)-(b.top+b.height/2)),prefixSize:getComputedStyle(prefix).fontSize,inputSize:getComputedStyle(input).fontSize};});
  assert.ok(slugAlignment.difference<1,'URL prefix and input should share a vertical center');assert.equal(slugAlignment.prefixSize,slugAlignment.inputSize);
  await page.locator('.writing-toolbar-more-trigger').click();const more=page.locator('.writing-toolbar-more');await more.waitFor();
  const youtube=more.locator('.editor-youtube-trigger');const bounds=await youtube.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));assert.ok(bounds.scrollWidth<=bounds.width,'YouTube label should fit inside its button');
  const buttonBounds=await more.locator('.tiptap-toolbar-group').last().locator('button').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return {left:r.left,right:r.right};}));for(let i=1;i<buttonBounds.length;i++)assert.ok(buttonBounds[i-1].right<=buttonBounds[i].left,'More menu buttons should not overlap');
  await page.locator('.writing-toolbar-more-trigger').click();
  for(const width of [1024,375]) {
    await page.setViewportSize({width,height:900});
    const retainedTitle=await title.inputValue();
    await chooseInterfaceLanguage(page,'zh-CN');await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');
    await chooseInterfaceLanguage(page,'en');await page.waitForFunction(()=>document.documentElement.lang==='en');
    assert.equal(await title.inputValue(),retainedTitle);assert.equal(await editor.innerText(),contentBefore);
    assert.equal(await page.locator('.writing-content-language [role=group] button').first().getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  assert.deepEqual(errors,[]);
  // A brand-new original without a URL can open and preview its English draft.
  zhId='33333333-3333-4333-8333-333333333333';enId='44444444-4444-4444-8444-444444444444';
  drafts[zhId]={id:zhId,locale:'zh-CN',version:1,post_id:null,post_status:'draft',payload:{title:'New original',content:'Original body',slug:'',summary:'',summary_mode:'manual',category:'',tags:[]},workflow:{state:'draft'}};
  drafts[enId]={...drafts[zhId],id:enId,locale:'en',payload:{...drafts[zhId].payload,title:'',content:''}};
  await page.setViewportSize({width:1280,height:900});await page.goto('http://127.0.0.1:4266/admin/write?draft='+zhId);await title.waitFor();
  await chooseInterfaceLanguage(page,'en');await page.waitForFunction(()=>document.documentElement.lang==='en');
  await page.locator('.writing-content-language [role=group] button').nth(1).click();await page.waitForFunction(()=>document.querySelector('#article-title')?.value==='');
  await title.fill('Unpublished English preview');await page.locator('[data-markdown-editor]').fill('English preview without a URL');
  await page.getByRole('button',{name:'Publish',exact:true}).click();await page.locator('.article-full-preview').waitFor();
  assert.match(await page.locator('.article-full-preview').innerText(),/Unpublished English preview/);await page.frameLocator('.article-full-preview iframe').getByText('English preview without a URL',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Run pre-publication checks',exact:true}).count(),0);
  const confirmPublish=page.locator('.article-review-publish');await confirmPublish.waitFor();assert.equal(await confirmPublish.isEnabled(),true);await confirmPublish.click();
  await page.waitForSelector('.article-published');assert.equal(publishes.length,1);assert.equal(publishes[0].id,enId);assert.equal(publishes[0].locale,'en');assert.equal(publishes[0].payload.title,'Unpublished English preview');assert.equal(publishes[0].payload.content,'English preview without a URL');
  assert.equal(identityCalls,1);assert.equal(drafts[zhId].post_id,drafts[enId].post_id);assert.equal(drafts[zhId].payload.slug,'');assert.deepEqual(errors,[]);
  // A lost discard response must keep the content and explain how to verify it.
  await page.goto('http://127.0.0.1:4266/admin/write?draft='+zhId);await title.waitFor();failDiscard=true;
  await page.getByRole('button',{name:'More article actions',exact:true}).click();await page.getByRole('menuitem',{name:'Discard unpublished Chinese changes',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByText('The discard result is unconfirmed. Copy your current content, then refresh to check.').first().waitFor();assert.equal(await title.inputValue(),'New original');
  console.log('PASS: UI-language switches preserve mounted editor, title/body/editorLocale; drafts save independently; failure retains English input; Chinese state survives round trip; no cross-language writes.');
 }finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
