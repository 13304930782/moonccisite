const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { chromium } = require('playwright');
const { createFixture, ID } = require('./fixtures/admin-redesign.cjs');
const BASE = process.env.ADMIN_REDESIGN_URL || 'http://127.0.0.1:5195';
const origin = new URL(BASE);
assert(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname), 'Local fixture preview only');
const OUT = path.resolve(process.env.WRITING_POLISH_OUT || '.cache/admin-redesign/writing-polish-chrome');
const selectedCase = process.env.WRITING_POLISH_CASE;
const rich = '<!--mooncci-richtext:v1-->\n<p>Chrome 写作验收正文，保留原有保存与发布流程。</p>';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1sAAAAASUVORK5CYII=','base64');
const results = [], startedAt = new Date().toISOString();
const distHash = () => crypto.createHash('sha256').update(fs.readFileSync(path.resolve('dist/index.html'))).digest('hex');
const buildIndexSha256 = distHash();
const layoutOnly = process.env.WRITING_POLISH_FOCUS === 'layout';
let browser, browserMetadata;
const log = (...args) => { const line = args.join(' '); console.log(line); fs.appendFileSync(path.join(OUT, 'run.log'), line + '\n'); };
async function until(test, label) { const end = Date.now() + 12000; while (Date.now() < end) { if (await test()) return; await new Promise(resolve => setTimeout(resolve, 35)); } throw Error('Timed out: ' + label); }
const editor = page => page.locator('.tiptap[contenteditable=true]');
const imageTrigger = page => page.locator('.article-image-trigger');
const seed = state => state.resetDraft({ title: '写作回归文章', content: rich, summary: '手写简介，记录实际浏览器验证的保存、图片、设置与发布流程。', category: '开发记录' });
async function ready(page) { await page.locator('#article-title').waitFor(); await editor(page).waitFor(); await page.locator('.writing-save-state[data-state=saved]').waitFor(); await until(() => imageTrigger(page).isEnabled(), 'visual editor ready'); }
async function saved(page) { await page.locator('.writing-save-state[data-state=saved]').waitFor(); }
async function manual(page, state) {
  const before = state.saves.length;
  if (await page.locator('.writing-save-trigger').isVisible()) await page.locator('.writing-save-trigger').click();
  else { await page.getByRole('button', { name: '更多文章操作', exact: true }).click(); await page.getByRole('menuitem', { name: '保存草稿', exact: true }).click(); }
  await until(() => state.saves.length > before, 'manual save'); await saved(page); assert.equal(state.saves.at(-1).save_kind, 'manual');
}
async function settings(page, width) {
  if (width >= 1280) return page.locator('.writing-settings');
  if(width>=768)await page.getByRole('button',{name:'文章设置',exact:true}).click();
  else{await page.getByRole('button', { name: '更多文章操作', exact: true }).click();await page.getByRole('menuitem', { name: '文章设置', exact: true }).click();}
  const panel = page.getByRole('dialog', { name: '文章设置', exact: true }); await panel.waitFor(); return panel;
}
async function closeSettings(page, width) {
  if (width >= 1280) return;
  await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: '文章设置', exact: true }).waitFor({ state: 'hidden' });
  await until(() => page.getByRole('button', { name: '更多文章操作', exact: true }).evaluate(element => document.activeElement === element), 'settings returns focus');
}
async function overflow(page, root) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page horizontal overflow');
  if (root) assert(await root.evaluate(element => element.scrollWidth <= element.clientWidth + 1), 'Panel horizontal overflow');
}
async function touchTargets(root, failures) {
  for (const element of await root.locator('button,a,input:not([type=file]),textarea,[role=menuitem],[role=menuitemradio]').all()) {
    if (!await element.isVisible()) continue;
    const box = await element.boundingBox();
    if(box.width < 43.5 || box.height < 43.5){const message='Target under44: ' + (await element.getAttribute('aria-label') || await element.textContent()) + ` ${box.width}x${box.height}`;if(failures)failures.push(message);else assert.fail(message);}
  }
}
async function summaryContract(page, panel) {
  return panel.evaluate(element => {
    const textarea = element.querySelector('#article-summary'), toggle = element.querySelector('[role=switch]'), thumb = toggle.querySelector('span');
    const box=toggle.getBoundingClientRect(),track=getComputedStyle(toggle,'::before'),canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');const layers=[];for(let node=toggle;node;node=node.parentElement)layers.unshift(node);ctx.fillStyle='#fff';ctx.fillRect(0,0,1,1);for(const node of layers){ctx.fillStyle=getComputedStyle(node).backgroundColor;ctx.fillRect(0,0,1,1);}ctx.fillStyle=track.backgroundColor;ctx.fillRect(0,0,1,1);const trackRGB=[...ctx.getImageData(0,0,1,1).data];ctx.fillStyle=getComputedStyle(thumb).backgroundColor;ctx.fillRect(0,0,1,1);const thumbRGB=[...ctx.getImageData(0,0,1,1).data];const luminance=rgb=>rgb.slice(0,3).map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0),a=luminance(trackRGB),b=luminance(thumbRGB);
    const probe=document.createElement('span');probe.style.color='var(--ui-on-brand)';element.append(probe);const onBrand=getComputedStyle(probe).color;probe.remove();
    return { onBrand,summaryHeight: textarea.getBoundingClientRect().height, resize: getComputedStyle(textarea).resize,
      checked: toggle.getAttribute('aria-checked'), toggle: toggle.getBoundingClientRect().toJSON(),
      fill: getComputedStyle(toggle, '::before').backgroundColor, thumb: thumb.getBoundingClientRect().toJSON(),
      thumbFill: getComputedStyle(thumb).backgroundColor,trackBounds:{left:box.left+parseFloat(track.left),right:box.right-parseFloat(track.right),top:box.top+parseFloat(track.top),bottom:box.bottom-parseFloat(track.bottom)},trackRGB,thumbRGB,thumbContrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05) };
  });
}
function switchGeometry(state){assert(state.thumb.left>=state.trackBounds.left-.5&&state.thumb.right<=state.trackBounds.right+.5&&state.thumb.top>=state.trackBounds.top-.5&&state.thumb.bottom<=state.trackBounds.bottom+.5,'Switch thumb protrudes beyond its track');assert(state.thumbContrast>=3,'Switch thumb contrast under3');}
async function compactFace(control,minWidth){const data=await control.evaluate(element=>{const box=element.getBoundingClientRect(),face=getComputedStyle(element,'::before'),canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d'),background=getComputedStyle(element).backgroundColor;ctx.fillStyle=background;ctx.fillRect(0,0,1,1);return{label:element.getAttribute('aria-label')||element.textContent,width:box.width,height:box.height,faceHeight:parseFloat(face.height),faceFill:face.backgroundColor,background,backgroundAlpha:ctx.getImageData(0,0,1,1).data[3]};});assert(data.width>=minWidth,`${data.label} width under${minWidth}`);assert.equal(data.height,44,`${data.label} hit target`);assert.equal(data.faceHeight,32,`${data.label} visible face`);assert.equal(data.backgroundAlpha,0,`${data.label} body background must be transparent; an opaque44px body defeats the32px face`);return data;}
async function summaryRow(panel){return panel.locator('.writing-summary-actions').evaluate(element=>{const row=element.getBoundingClientRect(),label=element.querySelector('.writing-ai-switch').getBoundingClientRect(),button=element.querySelector('.admin-button').getBoundingClientRect();return{row:row.toJSON(),label:label.toJSON(),button:button.toJSON(),gap:getComputedStyle(element).gap,overflow:element.scrollWidth>element.clientWidth};});}
async function imageMenu(page, width) {
  await imageTrigger(page).click();
  const surface = width < 768 ? page.getByRole('dialog', { name: '正文图片', exact: true }) : page.locator('.article-image-menu');
  await surface.waitFor();
  for (const name of ['从媒体库选择', '上传图片', '插入链接']) assert(await surface.getByText(name, { exact: true }).isVisible());
  await touchTargets(surface); return surface;
}
async function imageAction(surface, width, name) {
  await surface.getByRole(width < 768 ? 'button' : 'menuitem', { name, exact: true }).click();
}
async function toolbarContract(page, width) {
  for(const name of ['Bold','Italic','Strike','Code','Underline']){
    const mark=page.locator('.editor-toolbar-frame > .tiptap-toolbar').getByRole('button',{name,exact:true});assert.equal(await mark.count(),1,`Common mark missing from main toolbar: ${name}`);assert(await mark.isVisible());
    if(width>=768){const box=await mark.boundingBox(),main=await page.locator('.editor-toolbar-frame > .tiptap-toolbar').boundingBox();assert(box.x>=main.x-.5&&box.x+box.width<=main.x+main.width+.5,`Common mark clipped: ${name}`);}
  }
  const data = await page.locator('.editor-toolbar-frame').evaluate(element => {
    const toolbar = element.querySelector('.tiptap-toolbar'), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'); canvas.width = canvas.height = 1;
    const rgba = color => { ctx.clearRect(0,0,1,1); ctx.fillStyle=color; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data]; };
    const lum = rgb => rgb.slice(0,3).map(value => value/255).map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4).reduce((total,value,index) => total + value*[.2126,.7152,.0722][index],0);
    const color = getComputedStyle(document.documentElement).getPropertyValue('--background'), background = rgba(color);
    return { width: toolbar.clientWidth, scrollWidth: toolbar.scrollWidth, overflowX: getComputedStyle(toolbar).overflowX,
      image: element.querySelector('.article-image-trigger')?.getBoundingClientRect().toJSON(),
      fade: getComputedStyle(element,'::after').backgroundImage, mask: getComputedStyle(toolbar).maskImage,
      buttons: [...toolbar.querySelectorAll('button')].filter(button => button.getBoundingClientRect().width).map(button => {
        const css = getComputedStyle(button), icon = button.querySelector('svg'), rgb = rgba(icon ? getComputedStyle(icon).color : css.color), a=lum(rgb), b=lum(background);
        return { label:button.getAttribute('aria-label') || button.textContent, disabled:button.disabled, opacity:css.opacity, color:rgb, contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05), width:button.getBoundingClientRect().width, height:button.getBoundingClientRect().height };
      }) };
  });
  for (const button of data.buttons) {
    assert(button.width >= 43.5 && button.height >= 43.5, 'Toolbar target under44: ' + button.label);
    if (!button.disabled) { assert.equal(Number(button.opacity), 1, 'Enabled control styled as disabled: ' + button.label); assert(button.contrast >= 3, 'Toolbar icon contrast under3: ' + button.label); }
  }
  if (width >= 768) {
    assert(data.scrollWidth <= data.width + 1, 'Desktop toolbar scrolls horizontally');
    assert.equal(await page.locator('.editor-scroll-control:visible').count(),0);
    assert.equal(await page.locator('.editor-toolbar-frame').getByRole('button',{name:'更多编辑工具',exact:true}).count(),1,'Additional formatting tools use one real Popover trigger');
  } else {
    assert(data.image, 'Mobile image trigger must be fixed inside toolbar frame');
    assert(data.scrollWidth > data.width + 1, 'Mobile toolbar should offer horizontal tools');
    assert(data.fade !== 'none' || data.mask !== 'none' || await page.locator('[class*=toolbar-fade]:visible').count(), 'Mobile toolbar needs a scroll-edge fade');
    const imageBefore = await imageTrigger(page).boundingBox();
    await page.locator('.editor-toolbar-frame .tiptap-toolbar').evaluate(element => { element.scrollLeft = 160; });
    const imageAfter = await imageTrigger(page).boundingBox(); assert(Math.abs(imageBefore.x-imageAfter.x)<1, 'Mobile image trigger scrolled out');
    await page.locator('.editor-toolbar-frame .tiptap-toolbar').evaluate(element => { element.scrollLeft=0; });
  }
  return data;
}

async function scenario(name, width, dark, configure, task, { viewportMock = false, legacySource = false, viewportInitialHeight = 1000 } = {}) {
  if(selectedCase && name!==selectedCase)return;
  const context = await browser.newContext({ viewport:{width,height:1000}, hasTouch:width<768, isMobile:width<768, reducedMotion:'reduce', serviceWorkers:'block' });
  const page=await context.newPage(), state=createFixture(), row={name,width,dark,passed:false,screenshots:[]}, errors=[], blocked=[]; results.push(row);
  configure?.(state); page.setDefaultTimeout(12000); page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(!['http:','https:'].includes(url.protocol)||url.origin===origin.origin)return route.continue();blocked.push(url.origin);return route.abort();});
  await page.addInitScript(dark=>{try{localStorage.setItem('mooncci-theme',dark?'dark':'light');}catch{}},dark);
  if(viewportMock)await page.addInitScript(height=>{const viewport=Object.assign(new EventTarget(),{height:Number(height),width:390,offsetTop:0,offsetLeft:0,pageTop:0,pageLeft:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});window.__writingViewportSimulation={set(values,event='resize'){Object.assign(viewport,values);viewport.dispatchEvent(new Event(event));return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));},snapshot(){return{height:viewport.height,width:viewport.width,offsetTop:viewport.offsetTop,offsetLeft:viewport.offsetLeft,scale:viewport.scale};}};},String(viewportInitialHeight));
  row.simulatedVisualViewport=viewportMock;await state.install(page);
  const shot=async label=>{const filename=`${name}-${label}.png`;await page.screenshot({path:path.join(OUT,filename)});row.screenshots.push(filename);};
  log('START',name);
  try {
    await page.goto(BASE+(state.role==='user'?'/account/write':'/admin/write')+'?draft='+ID,{waitUntil:'domcontentloaded'});
    if(legacySource){await page.locator('#article-title').waitFor();await page.getByRole('textbox',{name:'Markdown 正文',exact:true}).waitFor();await saved(page);}else await ready(page);
    row.capabilities=await page.evaluate(()=>({hoverNone:matchMedia('(hover:none)').matches,pointerCoarse:matchMedia('(pointer:coarse)').matches,userAgent:navigator.userAgent}));
    assert.equal(row.capabilities.hoverNone,width<768);assert(!/Edg\//.test(row.capabilities.userAgent));
    await task({page,state,row,shot});await overflow(page);assert.deepEqual(row.targetFailures||[],[]);assert.deepEqual(errors,[]);row.passed=true;log('PASS',name);
  } catch(error) { row.error=error.stack;await shot('FAIL').catch(()=>{});log('FAIL',name,error.stack); }
  finally {
    row.runtimeErrors=errors;row.blockedExternal=blocked;row.requests=state.requests;row.saves=state.saves;row.finalDraft=state.draft;
    row.uploads=state.uploads.map(raw=>({quality:/name="quality"\r\n\r\n([^\r\n]+)/.exec(raw||'')?.[1],hasImage:/name="image"; filename=/.test(raw||'')}));
    await context.close();fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({startedAt,scope:selectedCase?'focused-case':layoutOnly?'focused-layout':'full',selectedCase,channel:'chrome',browserMetadata,buildIndexSha256,buildUnchanged:distHash()===buildIndexSha256,passed:results.every(row=>row.passed),mode:'Local persistent isolated API fixtures; no production writes',limitations:[selectedCase?'Only the explicitly selected scenario executed in this run.':layoutOnly?'Only layout checks executed in this run. Full business and keyboard results are archived separately.':'VisualViewport keyboard checks use deterministic mocked resize/scroll geometry.','No physical phone or native software keyboard test.'],results},null,2)+'\n');
  }
}

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'run.log'),'');browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const cdp=await browser.newBrowserCDPSession();browserMetadata=await cdp.send('Browser.getVersion');browserMetadata.executable=(await cdp.send('Browser.getBrowserCommandLine')).arguments[0];await cdp.detach();
    assert.equal(browserMetadata.executable.replaceAll('\\','/').toLowerCase(),'c:/program files/google/chrome/application/chrome.exe');
    for(const width of [1440,390])for(const dark of [false,true])await scenario(`empty-${width}-${dark?'dark':'light'}`,width,dark,null,async({page,state,row,shot})=>{
      assert.equal(await page.locator('#article-title').inputValue(),'');assert.equal((await editor(page).innerText()).trim(),'');
      assert.equal(await page.locator('.writing-back').evaluate(element=>element.tagName),'BUTTON');
      assert.equal(await imageTrigger(page).getAttribute('aria-label'),'插入图片');
      row.blankPlaceholders=await page.evaluate(()=>{const scope=document.querySelector('.writing-workspace'),probe=document.createElement('span');probe.style.color='var(--ui-text-muted)';scope.appendChild(probe);const expected=getComputedStyle(probe).color;probe.remove();const title=getComputedStyle(document.querySelector('#article-title'),'::placeholder'),body=getComputedStyle(document.querySelector('.simple-editor-content'),'::before');return{expected,titleColor:title.color,titleOpacity:title.opacity,bodyColor:body.color,bodyContent:body.content};});
      assert.equal(row.blankPlaceholders.titleColor,row.blankPlaceholders.expected);assert.equal(Number(row.blankPlaceholders.titleOpacity),1);assert.equal(row.blankPlaceholders.bodyColor,row.blankPlaceholders.expected);assert.match(row.blankPlaceholders.bodyContent,/开始写作/);
      row.initialActiveElement=await page.evaluate(()=>document.activeElement.tagName);
      for(const name of ['Bold','Italic','Format text as heading'])assert(await page.getByRole('button',{name,exact:true}).isEnabled(),'Initially fake disabled '+name);
      const undo=page.locator('.editor-toolbar-frame').getByRole('button',{name:'Undo',exact:true});assert(await undo.isDisabled(),'Empty draft Undo should be truly disabled');row.initialUndoOpacity=await undo.evaluate(element=>Number(getComputedStyle(element).opacity));assert.equal(row.initialUndoOpacity,.4);
      row.publishFace=await compactFace(page.getByRole('button',{name:'发布',exact:true}),72);if(width===1440)row.saveFace=await compactFace(page.locator('.writing-save-trigger'),72);
      await shot('blank');await editor(page).focus();
      row.toolbar=await toolbarContract(page,width);
      const extraTrigger=page.getByRole('button',{name:'更多编辑工具',exact:true});await extraTrigger.click();const extra=page.locator('.writing-toolbar-more');await extra.waitFor();assert.equal(await extra.getByRole('menuitem').count(),0,'Formatting commands retain native button semantics');assert(await extra.locator('button').count()>=7);await touchTargets(extra);await shot('formatting-popover');await page.keyboard.press('Escape');await extra.waitFor({state:'hidden'});await until(()=>extraTrigger.evaluate(element=>document.activeElement===element),'formatting popover returns focus');
      if(width===1440){
        row.desktop=await page.evaluate(()=>{const top=document.querySelector('.writing-topbar'),topBox=top.getBoundingClientRect(),mode=document.querySelector('.writing-mode-desktop').getBoundingClientRect(),title=document.querySelector('#article-title').getBoundingClientRect(),head=document.querySelector('.writing-settings-heading').getBoundingClientRect(),actions=document.querySelector('.writing-topbar-actions').getBoundingClientRect();return{height:topBox.height,padding:getComputedStyle(top).padding,titleGap:title.top-topBox.bottom,settingsCenter:head.y+head.height/2,actionsCenter:actions.y+actions.height/2,topbarCenter:topBox.x+topBox.width/2,modeCenter:mode.x+mode.width/2};});
        assert.equal(row.desktop.height,72);assert.equal(row.desktop.padding,'12px 28px 0px');assert(Math.abs(row.desktop.titleGap-24)<1);assert(Math.abs(row.desktop.settingsCenter-row.desktop.actionsCenter)<1);assert(Math.abs(row.desktop.modeCenter-row.desktop.topbarCenter)<=1,'Desktop mode switch is not centered in main canvas');
      }
      await page.locator('#article-title').focus();await page.keyboard.press('Tab');
      assert(await imageTrigger(page).evaluate(element=>element===document.activeElement),'Title Tab must reach image trigger');
      await page.keyboard.press('Tab');const focused=await page.evaluate(()=>document.activeElement.getAttribute('aria-label')||document.activeElement.textContent);row.toolbarFirstTab=focused;
      assert(await page.locator('.editor-toolbar-frame').evaluate(element=>element.contains(document.activeElement)),'Image Tab must reach formatting toolbar');
      await page.keyboard.press('ArrowRight');assert(await page.locator('.editor-toolbar-frame').evaluate(element=>element.contains(document.activeElement)),'Arrow escaped toolbar');
      await page.keyboard.press('Tab');assert(!await page.locator('.tiptap-toolbar').evaluate(element=>element.contains(document.activeElement)),'Tab trapped inside toolbar');
      const menu=await imageMenu(page,width);await shot(width===390?'image-sheet':'image-dropdown');await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});await until(()=>imageTrigger(page).evaluate(element=>element===document.activeElement),'image overlay focus return');
      if(width===390){await page.getByRole('button',{name:'更多文章操作',exact:true}).click();const more=page.locator('.writing-more-menu');assert.equal(await more.getByRole('menuitem').count(),3,'Phone more menu is limited to its three specified actions');for(const name of ['文章设置','修订历史','保存草稿'])assert(await more.getByRole('menuitem',{name,exact:true}).isVisible());await shot('more-menu');await page.keyboard.press('Escape');}
      const panel=await settings(page,width);if(width===390){await shot('settings-open');row.settingsOpening=await panel.evaluate(element=>({title:element.querySelector('[data-slot=sheet-title]').getBoundingClientRect().toJSON(),cover:element.querySelector('.writing-cover-drop').getBoundingClientRect().toJSON(),panel:element.getBoundingClientRect().toJSON()}));assert(row.settingsOpening.title.top>=row.settingsOpening.panel.top&&row.settingsOpening.cover.bottom<=1000,'Settings opening must show title and cover before scrolling');}await overflow(page,panel);row.targetFailures=[];await touchTargets(panel,row.targetFailures);
      row.qualityFaces=[];for(const button of await panel.getByRole('group',{name:'图片质量',exact:true}).getByRole('button').all()){await button.click();row.qualityFaces.push(await compactFace(button,64));}await panel.getByRole('group',{name:'图片质量',exact:true}).getByRole('button',{name:'标准',exact:true}).click();
      row.qualityGroup=await panel.getByRole('group',{name:'图片质量',exact:true}).evaluate(element=>{const box=element.getBoundingClientRect(),group=getComputedStyle(element,'::before'),selected=element.querySelector('[aria-pressed=true]'),button=selected.getBoundingClientRect(),face=getComputedStyle(selected,'::before');return{groupHeight:parseFloat(group.height),selectedHeight:parseFloat(face.height),groupTop:box.top+parseFloat(group.top),selectedTop:button.top+parseFloat(face.top)};});assert.equal(row.qualityGroup.groupHeight,38);assert.equal(row.qualityGroup.selectedHeight,32);assert(Math.abs(row.qualityGroup.selectedTop-row.qualityGroup.groupTop-3)<.5,'Quality selected face needs3px inner vertical padding');
      row.summaryButton=await compactFace(panel.getByRole('button',{name:'生成简介',exact:true}),80);assert.notEqual(row.summaryButton.faceFill,'rgba(0, 0, 0, 0)','Generate summary must have a visible soft background');row.summaryRow=await summaryRow(panel);assert(!row.summaryRow.overflow);assert(Math.abs(row.summaryRow.label.y+row.summaryRow.label.height/2-row.summaryRow.button.y-row.summaryRow.button.height/2)<=1,'Summary switch and button centers differ');
      if(width===390){assert(await panel.evaluate(element=>element.contains(document.activeElement)));await page.keyboard.press('Tab');assert(await panel.evaluate(element=>element.contains(document.activeElement)),'Tab escaped settings');}
      row.placeholders=await panel.evaluate(element=>{const token=document.createElement('span');token.style.color='var(--ui-text-muted)';element.appendChild(token);const expected=getComputedStyle(token).color;token.remove();return{expected,fields:[...element.querySelectorAll('input[placeholder],textarea[placeholder]')].map(input=>({id:input.id,color:getComputedStyle(input,'::placeholder').color,opacity:getComputedStyle(input,'::placeholder').opacity}))};});
      for(const placeholder of row.placeholders.fields){assert.equal(placeholder.color,row.placeholders.expected,placeholder.id+' placeholder token');assert.equal(Number(placeholder.opacity),1);}
      const toggle=panel.getByRole('switch',{name:'DeepSeek 自动总结',exact:true});row.switchOff=await summaryContract(page,panel);assert.equal(row.switchOff.checked,'false');assert.equal(row.switchOff.summaryHeight,104);assert.equal(row.switchOff.resize,'none');await toggle.scrollIntoViewIfNeeded();await shot('summary-off');switchGeometry(row.switchOff);
      await toggle.click();row.switchOn=await summaryContract(page,panel);assert.equal(row.switchOn.checked,'true');assert.equal(row.switchOn.thumbFill,row.switchOn.onBrand);assert.notEqual(row.switchOn.fill,row.switchOff.fill);assert(row.switchOn.thumb.x>row.switchOff.thumb.x);await shot('summary-on');switchGeometry(row.switchOn);await toggle.click();await closeSettings(page,width);
      if(width===390){
        await editor(page).fill(Array.from({length:45},(_,index)=>`滚动正文第 ${index+1} 行，用于确认吸顶工具与图片入口。`).join('\n'));
        await until(()=>state.draft.payload.content.includes('滚动正文第 45 行'),'autosave scrolling body');
        await page.locator('.admin-main').evaluate(element=>{element.scrollTop=650;return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
        row.sticky=await page.evaluate(()=>[...document.querySelectorAll('.writing-topbar,.article-editor-image-row,.editor-toolbar-frame')].filter(element=>element.getBoundingClientRect().height>0&&['sticky','fixed'].includes(getComputedStyle(element).position)).map(element=>({class:element.className,rect:element.getBoundingClientRect().toJSON()})));
        assert(row.sticky.every(item=>item.rect.bottom<=100.5),'Mobile sticky controls exceed100px');assert(row.sticky.some(item=>item.class.includes('editor-toolbar-frame')));await shot('scroll-middle');
      }
    });

    await scenario('summary-row-300px',340,false,null,async({page,row,shot})=>{const panel=await settings(page,340);await panel.locator('.writing-summary').scrollIntoViewIfNeeded();row.summaryRow=await summaryRow(panel);assert(Math.abs(row.summaryRow.row.width-300)<1);assert(!row.summaryRow.overflow);assert(Math.abs(row.summaryRow.label.y+row.summaryRow.label.height/2-row.summaryRow.button.y-row.summaryRow.button.height/2)<=1,'300px summary row wrapped');assert.equal(row.summaryRow.row.height,44);assert(row.summaryRow.label.width<=row.summaryRow.row.width-row.summaryRow.button.width-8+.5);assert(row.summaryRow.label.right+8<=row.summaryRow.button.left+.5);assert(row.summaryRow.button.width>=80);assert(row.summaryRow.button.x-row.summaryRow.label.right>=7.5);await compactFace(panel.getByRole('button',{name:'生成简介',exact:true}),80);await shot('single-row');});
    if(!layoutOnly){
    await scenario('desktop-business',1440,false,seed,async({page,state,row,shot})=>{
      await page.locator('#article-title').fill('Chrome 自动保存后的标题');await editor(page).click();await page.keyboard.insertText('自动保存正文');await until(()=>state.draft.payload.title==='Chrome 自动保存后的标题'&&state.draft.payload.content.includes('自动保存正文'),'auto draft');assert(state.saves.some(save=>save.save_kind==='auto'));await manual(page,state);
      const before=state.saves.length;await editor(page).click();await page.keyboard.press('Control+s');await until(()=>state.saves.length>before,'Ctrl+S');assert.equal(state.saves.at(-1).save_kind,'manual');
      await page.locator('#article-category').fill('Chrome分类');await page.locator('#article-tags').fill('标签一');await page.locator('#article-tags').press('Enter');await page.locator('#article-tags').fill('标签二,');await manual(page,state);assert.deepEqual(state.draft.payload.tags,['标签一','标签二']);
      let releaseAI,aiRequested=false;
      await page.route('**/api/article-seo/generate',async route=>{const request=route.request(),record={path:'/api/article-seo/generate',method:request.method(),query:'',body:request.postDataJSON(),status:null};state.requests.push(record);aiRequested=true;await new Promise(resolve=>{releaseAI=resolve;});record.status=200;return route.fulfill({json:{summary:'根据当前正文生成的测试简介，记录清晰的操作与实践经验。',summary_mode:'ai',summary_receipt:'a'.repeat(64)}});});
      const toggle=page.getByRole('switch',{name:'DeepSeek 自动总结',exact:true});await toggle.click();await page.getByRole('button',{name:'生成简介',exact:true}).click();await until(()=>aiRequested,'held AI request');
      try{await until(()=>page.locator('.tiptap').getAttribute('contenteditable').then(value=>value==='false'),'AI busy makes editor truly read-only');assert(await imageTrigger(page).isDisabled());row.aiBusyEditable=await page.locator('.tiptap').getAttribute('contenteditable');}finally{releaseAI?.();}
      await page.getByText('AI 简介已生成。',{exact:true}).waitFor();await manual(page,state);assert.equal(state.draft.payload.summary_receipt,'a'.repeat(64));
      await page.locator('#article-category').fill('Chrome最终分类');await manual(page,state);assert.equal(state.draft.payload.summary_receipt,'');await page.locator('#article-summary').fill('作者手写简介，确认保存后的字段与重新加载读取一致。');await manual(page,state);
      await page.getByRole('group',{name:'图片质量',exact:true}).getByRole('button',{name:'高清',exact:true}).click();await page.getByLabel('上传封面',{exact:true}).setInputFiles({name:'cover.png',mimeType:'image/png',buffer:png});await page.locator('.writing-cover-preview img').waitFor();await until(()=>state.uploads.length===1,'cover upload');assert.match(state.uploads[0],/name="quality"\r\n\r\nhigh/);await manual(page,state);
      await page.reload();await ready(page);assert.equal(await page.locator('#article-category').inputValue(),'Chrome最终分类');for(const tag of ['标签一','标签二'])assert(await page.getByRole('button',{name:'移除标签 '+tag,exact:true}).isVisible());assert.equal(state.draft.payload.cover_image,'/qa-cover.svg');assert.equal(state.draft.payload.summary_mode,'manual');
      await editor(page).click();await page.keyboard.press('Control+a');await page.getByRole('button',{name:'Link',exact:true}).click();const address=page.getByRole('textbox',{name:'链接地址',exact:true}),expectedLink='https://example.test/chrome-link';await address.fill(expectedLink);await address.press('Home');assert(await address.evaluate(element=>element===document.activeElement&&element.selectionStart===0));await address.press('End');assert(await address.evaluate(element=>element===document.activeElement&&element.selectionStart===element.value.length));await address.press('Enter');await until(()=>state.draft.payload.content.match(/href="([^"]+)"/)?.[1]===expectedLink,'link Enter persisted');await manual(page,state);assert.equal(state.draft.payload.content.match(/href="([^"]+)"/)?.[1],expectedLink);
      await page.getByRole('button',{name:'修订历史',exact:true}).click();const history=page.getByRole('dialog',{name:'修订历史',exact:true});await history.getByRole('button',{name:/手动保存 ·/}).click();await history.getByRole('button',{name:'恢复为草稿',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'确认继续',exact:true}).click();await until(()=>state.restores===1,'history restore');await page.keyboard.press('Escape');await history.waitFor({state:'hidden'});assert.equal(await page.locator('#article-title').inputValue(),'恢复后的历史标题');
      await shot('readback');await page.getByRole('button',{name:'发布',exact:true}).click();await page.getByRole('button',{name:'运行发布前检查',exact:true}).click();await until(()=>page.getByRole('button',{name:'确认发布',exact:true}).isEnabled(),'publish check');await page.getByRole('button',{name:'确认发布',exact:true}).click();await page.getByRole('heading',{name:'文章已发布',exact:true}).waitFor();assert.equal(state.publishes,1);assert.equal(state.draft.dirty,0);await shot('published');
    });

    await scenario('phone-business',390,true,seed,async({page,state,row,shot})=>{
      await editor(page).click();let surface=await imageMenu(page,390);await imageAction(surface,390,'从媒体库选择');const picker=page.getByRole('dialog',{name:'选择图片',exact:true});await picker.getByRole('button',{name:/软件展示图/}).click();await picker.getByRole('button',{name:'使用图片',exact:true}).click();await until(()=>state.draft.payload.content.includes('<img'),'body media insert');
      surface=await imageMenu(page,390);await imageAction(surface,390,'插入链接');const url=page.getByRole('dialog',{name:'插入图片链接',exact:true});await url.getByLabel('图片地址',{exact:true}).fill('/qa-cover.svg?touch=1');await url.getByLabel('图片替代文本',{exact:true}).fill('触屏插图');await url.getByRole('button',{name:'插入图片',exact:true}).click();await until(()=>state.draft.payload.content.includes('touch=1'),'body image URL');
      surface=await imageMenu(page,390);const chooser=page.waitForEvent('filechooser');await imageAction(surface,390,'上传图片');await(await chooser).setFiles({name:'body.png',mimeType:'image/png',buffer:png});await until(()=>state.uploads.length===1,'body upload');await until(()=>imageTrigger(page).isEnabled(),'upload settled');await manual(page,state);
      const panel=await settings(page,390);await panel.locator('#article-category').fill('触屏分类');await panel.locator('#article-tags').fill('触屏标签');await panel.locator('#article-tags').press('Enter');await panel.getByRole('button',{name:'从媒体库选择',exact:true}).click();await picker.getByRole('button',{name:/软件展示图/}).click();await picker.getByRole('button',{name:'使用图片',exact:true}).click();await panel.getByRole('button',{name:'调整取景',exact:true}).click();const framing=page.getByRole('dialog',{name:'调整封面取景',exact:true});await until(()=>framing.getByRole('button',{name:'确定',exact:true}).isEnabled(),'framing ready');await framing.getByRole('slider',{name:'详情头图缩放',exact:true}).focus();await page.keyboard.press('ArrowRight');await framing.getByRole('button',{name:'确定',exact:true}).click();await until(()=>panel.getByRole('button',{name:'调整取景',exact:true}).evaluate(element=>element===document.activeElement),'framing focus');await closeSettings(page,390);await manual(page,state);assert.equal(state.draft.payload.cover_crop.detail.zoom,1.1);
      await page.reload();await ready(page);const reloaded=await settings(page,390);assert.equal(await reloaded.locator('#article-category').inputValue(),'触屏分类');assert(await reloaded.getByRole('button',{name:'移除标签 触屏标签',exact:true}).isVisible());await shot('settings-readback');await closeSettings(page,390);
      await page.getByRole('button',{name:'更多文章操作',exact:true}).click();await page.getByRole('menuitem',{name:'修订历史',exact:true}).click();const history=page.getByRole('dialog',{name:'修订历史',exact:true});await history.getByRole('button',{name:/手动保存 ·/}).waitFor();await page.keyboard.press('Escape');await history.waitFor({state:'hidden'});assert(await page.getByRole('button',{name:'更多文章操作',exact:true}).evaluate(element=>element===document.activeElement));
    });
    await scenario('pending-upload-mode-guard',1440,false,state=>state.resetDraft({title:'旧 Markdown 上传回归',content:'# 旧 Markdown 标题\n\n保留原始正文。',summary:'检查图片上传期间切换模式的保护。',category:'开发记录'}),async({page,state,row,shot})=>{
      await page.locator('.writing-source-toggle button').click();await editor(page).waitFor();await until(()=>imageTrigger(page).isEnabled(),'legacy switched to visual');
      let releaseUpload,requested=false;
      await page.route('**/api/upload/image',async route=>{const request=route.request();state.uploads.push(request.postData());state.requests.push({path:'/api/upload/image',method:request.method(),query:'',body:'isolated multipart upload'});requested=true;await new Promise(resolve=>{releaseUpload=resolve;});return route.fulfill({json:{url:'/qa-cover.svg'}});});
      const menu=await imageMenu(page,1440),chooser=page.waitForEvent('filechooser');await imageAction(menu,1440,'上传图片');await(await chooser).setFiles({name:'pending-body.png',mimeType:'image/png',buffer:png});await until(()=>requested,'held body upload');
      try{
        await until(()=>imageTrigger(page).isDisabled(),'upload disables image trigger');await page.evaluate(()=>{window.__writingUploadEditor=document.querySelector('.tiptap');});
        const source=page.locator('.writing-source-toggle button'),modes=page.locator('.writing-mode-desktop button');assert(await source.isDisabled());
        row.modeGuard=[];for(const control of [source,...await modes.all()]){assert(await control.isDisabled());row.modeGuard.push(await control.innerText());await control.evaluate(element=>element.click());}
        assert.equal(await page.locator('.article-editor').getAttribute('data-mode'),'visual');assert(await page.evaluate(()=>window.__writingUploadEditor===document.querySelector('.tiptap')),'Pending upload editor unmounted');
      }finally{releaseUpload?.();}
      await until(()=>state.draft.payload.content.includes('<img')&&state.draft.payload.content.includes('/qa-cover.svg'),'pending image inserted into retained editor');await until(()=>imageTrigger(page).isEnabled(),'upload settled');await manual(page,state);assert(await page.evaluate(()=>window.__writingUploadEditor===document.querySelector('.tiptap')));assert.equal(await editor(page).locator('img[src="/qa-cover.svg"]').count(),1);await shot('inserted');
    },{legacySource:true});
    await scenario('account-tablet-canvas',1024,false,state=>{seed(state);state.role='user';state.publishing=true;},async({page,row,shot})=>{
      assert.equal(new URL(page.url()).pathname,'/account/write');const status=page.locator('.writing-save-state'),box=await status.boundingBox();assert(await status.isVisible());assert(box.width>=50,'Contributor save status squeezed out');row.header=await page.locator('.writing-topbar').boundingBox();row.status=box;assert(row.header.width>=1000,'Account writing canvas still constrained by outer shell');assert(await page.getByRole('button',{name:'预览并提交审核',exact:true}).isVisible());assert.equal(await page.getByRole('button',{name:'发布',exact:true}).count(),0);await shot('full-canvas');
    });
    await scenario('desktop-toolbar-boundary-768',768,false,null,async({page,row,shot})=>{
      for(const name of ['Bold','Italic','Format text as heading'])assert(await page.getByRole('button',{name,exact:true}).isEnabled(),'Boundary toolbar initially disabled '+name);row.toolbar=await toolbarContract(page,768);await overflow(page);await shot('main-tools');
    });
    for(const dark of [false,true])await scenario(`keyboard-simulation-${dark?'dark':'light'}`,390,dark,seed,async({page,row,shot})=>{
      const workspace=page.locator('.writing-workspace'),frame=page.locator('.editor-toolbar-frame');
      const setViewport=(values,event='resize')=>page.evaluate(({values,event})=>window.__writingViewportSimulation.set(values,event),{values,event});
      const closed=label=>until(()=>workspace.getAttribute('data-keyboard-open').then(value=>value!=='true'),label);
      const snapshot=()=>page.evaluate(()=>{const scope=document.querySelector('.writing-workspace'),toolbar=document.querySelector('.editor-toolbar-frame'),content=document.querySelector('.simple-editor-content');return{viewport:window.__writingViewportSimulation.snapshot(),open:scope.dataset.keyboardOpen||false,position:getComputedStyle(toolbar).position,toolbar:toolbar.getBoundingClientRect().toJSON(),contentTop:content.getBoundingClientRect().top,editor:document.querySelector('.article-editor').getBoundingClientRect().toJSON(),variables:['--writing-keyboard-top','--writing-keyboard-left','--writing-keyboard-width'].map(key=>[key,scope.style.getPropertyValue(key)])};});
      await editor(page).focus();row.before=await snapshot();await setViewport({height:620});await until(()=>workspace.getAttribute('data-keyboard-open').then(value=>value==='true'),'simulated keyboard opened');row.resized=await snapshot();assert.equal(row.resized.position,'fixed');assert(Math.abs(row.resized.toolbar.bottom-620)<1);assert(Math.abs(row.resized.contentTop-row.before.contentTop)<1,'Floating toolbar must retain flow space');
      await setViewport({offsetTop:80},'scroll');await until(()=>frame.boundingBox().then(box=>Math.abs(box.y+box.height-700)<1),'visualViewport offset scroll');row.offsetScrolled=await snapshot();assert(row.offsetScrolled.toolbar.left>=row.offsetScrolled.editor.left);assert(row.offsetScrolled.toolbar.right<=row.offsetScrolled.editor.right);await shot('keyboard-open-simulated');
      await imageTrigger(page).focus();await until(()=>workspace.getAttribute('data-keyboard-open').then(value=>value==='true'),'toolbar focus retains keyboard positioning');
      await setViewport({scale:2});await closed('pinch zoom fallback');row.scaleFallback=await snapshot();assert.notEqual(row.scaleFallback.position,'fixed');
      await editor(page).focus();await setViewport({scale:1,width:0});await closed('zero-width viewport fallback');
      await setViewport({width:NaN});await closed('nonfinite-width viewport fallback');row.nonfiniteFallback=await snapshot();
      await setViewport({width:390,offsetLeft:NaN});await closed('nonfinite-offset viewport fallback');
      await setViewport({offsetLeft:0});await until(()=>workspace.getAttribute('data-keyboard-open').then(value=>value==='true'),'valid viewport restores positioning');
      await page.locator('#article-title').focus();await closed('leaving editor restores sticky');row.blurred=await snapshot();assert.notEqual(row.blurred.position,'fixed');
      await setViewport({height:1000,offsetTop:0});await closed('viewport restored');await overflow(page);
    },{viewportMock:true});
    await scenario('keyboard-source-simulation',390,false,state=>state.resetDraft({title:'旧 Markdown 键盘回归',content:'# 保留旧源码\n\n源码正文在浮底前后保持同一位置。',summary:'源码模式键盘浮底占位检查。',category:'开发记录'}),async({page,row,shot})=>{
      const textarea=page.getByRole('textbox',{name:'Markdown 正文',exact:true}),workspace=page.locator('.writing-workspace'),frame=page.locator('.article-source-toolbar');
      const capture=async()=>({textarea:await textarea.boundingBox(),toolbar:await frame.boundingBox(),position:await frame.evaluate(element=>getComputedStyle(element).position),open:await workspace.getAttribute('data-keyboard-open')});
      await textarea.focus();row.before=await capture();await page.evaluate(()=>window.__writingViewportSimulation.set({height:620}));await until(()=>workspace.getAttribute('data-keyboard-open').then(value=>value==='true'),'source keyboard opened');row.opened=await capture();assert.equal(row.opened.position,'fixed');assert(Math.abs(row.opened.toolbar.y+row.opened.toolbar.height-620)<1);assert(Math.abs(row.before.textarea.y-row.opened.textarea.y)<1,'Source textarea jumped when keyboard toolbar floated');await shot('keyboard-open-simulated');
      await page.locator('#article-title').focus();await until(()=>workspace.getAttribute('data-keyboard-open').then(value=>value!=='true'),'source blur restores sticky');await page.evaluate(()=>window.__writingViewportSimulation.set({height:1000}));row.closed=await capture();assert.notEqual(row.closed.position,'fixed');assert(Math.abs(row.before.textarea.y-row.closed.textarea.y)<1,'Source textarea jumped after closing keyboard');
    },{viewportMock:true,legacySource:true});
    for(const initial of [NaN,Infinity])await scenario('keyboard-initial-'+String(initial),390,false,seed,async({page,row})=>{
      row.initialViewportHeight=await page.evaluate(()=>String(window.visualViewport.height));assert.equal(row.initialViewportHeight,String(initial),'Mock must retain its nonfinite initial value');const workspace=page.locator('.writing-workspace');await editor(page).focus();await page.evaluate(()=>window.__writingViewportSimulation.set({height:1000}));assert.notEqual(await workspace.getAttribute('data-keyboard-open'),'true','Full-height recovery from invalid initial viewport must remain sticky');
      await page.evaluate(()=>window.__writingViewportSimulation.set({height:620}));await until(()=>workspace.getAttribute('data-keyboard-open').then(value=>value==='true'),'recovered initial viewport can float');await page.evaluate(()=>window.__writingViewportSimulation.set({height:1000}));await until(()=>workspace.getAttribute('data-keyboard-open').then(value=>value!=='true'),'recovered full height closes keyboard');row.recovered=true;
    },{viewportMock:true,viewportInitialHeight:initial});
    }
    if(selectedCase)assert.equal(results.length,1,'Unknown WRITING_POLISH_CASE');assert.equal(distHash(),buildIndexSha256,'Build changed during acceptance');log(JSON.stringify({passed:results.every(row=>row.passed),scenarios:results.length,screenshots:results.flatMap(row=>row.screenshots).length,failed:results.filter(row=>!row.passed).map(row=>row.name),report:path.join(OUT,'report.json')},null,2));if(results.some(row=>!row.passed))process.exitCode=1;
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
