const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { createFixture, now, ID } = require('./fixtures/admin-redesign.cjs');

const BASE = process.env.ADMIN_REDESIGN_URL || 'http://127.0.0.1:5195';
const target = new URL(BASE);
assert(target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname), 'Only a local preview is allowed');
const OUT = path.resolve(process.env.MEDIA_TOUCH_OUT || '.cache/admin-redesign/media-touch-chrome');
const distIndex = path.resolve('dist/index.html');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const startedAt = new Date().toISOString(), buildIndexSha256 = hash(distIndex), results = [];
let browser, browserMetadata;
const log = (...values) => { const line = values.join(' '); fs.appendFileSync(path.join(OUT, 'run.log'), line + '\n'); console.log(line); };

function fixture() {
  const state = { requests: [] };
  const items = Array.from({ length: 23 }, (_, index) => ({
    id: index + 1, filename: `touch-${index + 1}.webp`, display_name: `触屏媒体 ${String(index + 1).padStart(2, '0')}`,
    alt_text: '隔离模拟图片', url: `/qa-touch-${['bright','dark','gray'][index%3]}.svg`, size: 20480, size_text: '20 KB', uploaded_at: now, updated_at: now,
    width: 1600, height: 900, status: index < 20 ? 'active' : 'trashed', ext: '.webp', mime: 'image/webp',
  }));
  state.install = async page => {
    await page.route('**/qa-touch-*.svg', route => {const kind=new URL(route.request().url()).pathname.match(/qa-touch-(bright|dark|gray)/)?.[1];assert(kind,'Unknown local image fixture');const color={bright:'#ffffff',dark:'#000000',gray:'#858585'}[kind];return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="${color}"/></svg>`});});
    await page.route('**/api/upload/**', async route => {
    const request = route.request(), url = new URL(request.url());
    state.requests.push({ path: url.pathname, method: request.method(), query: Object.fromEntries(url.searchParams) });
    // A mistaken confirmation must fail locally and remain visible in the evidence.
    if (request.method() !== 'GET') return route.fulfill({ status: 405, json: { message: 'Read-only touch fixture rejects writes' } });
    assert.equal(url.pathname, '/api/upload/media');
    const status = url.searchParams.get('status') || 'active', query = (url.searchParams.get('q') || '').toLowerCase();
    const rows = items.filter(item => item.status === status && [item.filename, item.display_name, item.alt_text].some(value => value.toLowerCase().includes(query)));
    return route.fulfill({ json: { items: rows, total: rows.length, page: 1, pageSize: 50 } });
    });
  };
  return state;
}

async function waitFor(test, label) {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    if (await test()) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out: ${label}`);
}

const bar = page => page.getByRole('region', { name: '批量媒体操作' });
const selectionStatus = page => bar(page).getByRole('status');
const thumb = (page, index = 0) => page.locator('.media-detail-trigger').nth(index);
const panel = page => page.locator('.media-detail-drawer');

async function countSelected(page, count) {
  await waitFor(() => selectionStatus(page).innerText().then(text => new RegExp(`(?:已选\\s*)?${count}\\s*(?:项|个)?`).test(text)), `selected ${count}`);
  assert.equal(await page.locator('.media-file-image.is-selected').count(), count);
  assert.equal(await panel(page).count(), 0, 'Selection opened the detail drawer');
  assert.equal(await page.locator('.media-card-actions').count(), 0, 'Selection must not render image action overlays');
}

async function selectionTarget(page) {
  const image = await page.locator('.media-file-image').first().boundingBox();
  const input = await page.locator('.media-file-select input').first().boundingBox();
  const circle = await page.locator('.media-file-select span').first().boundingBox();
  assert.equal(circle.width, 28); assert.equal(circle.height, 28);
  assert.equal(circle.x-image.x,8);assert.equal(circle.y-image.y,8);
  assert.equal(input.width, 44); assert.equal(input.height, 44);
  for (const box of [circle, input]) assert(box.x >= image.x && box.y >= image.y && box.x + box.width <= image.x + image.width && box.y + box.height <= image.y + image.height, 'Selection target must remain inside thumbnail');
  return { image, input, circle };
}

async function checkboxAppearance(page, selected) {
  const data = await page.locator('.media-file-image').evaluateAll(images => images.slice(0,6).map(image => {
    const input=image.querySelector('input[type=checkbox]'),circle=image.querySelector('.media-file-select span'),svg=circle.querySelector('svg'),css=getComputedStyle(circle),probe=document.createElement('span');
    probe.style.color=getComputedStyle(image).getPropertyValue('--ui-brand');image.append(probe);const brand=getComputedStyle(probe).color;probe.style.color=getComputedStyle(image).getPropertyValue('--ui-on-brand');const onBrand=getComputedStyle(probe).color;probe.remove();
    return {checked:input.checked,type:input.type,image:image.querySelector('img').getAttribute('src'),opacity:getComputedStyle(image.querySelector('.media-detail-trigger')).opacity,
      imageOpacity:getComputedStyle(image.querySelector('img')).opacity,outline:getComputedStyle(image).outline,outlineWidth:getComputedStyle(image).outlineWidth,outlineStyle:getComputedStyle(image).outlineStyle,outlineColor:getComputedStyle(image).outlineColor,outlineOffset:getComputedStyle(image).outlineOffset,
      brand,onBrand,fill:css.backgroundColor,border:css.border,shadow:css.boxShadow,svgOpacity:svg&&getComputedStyle(svg).opacity,stroke:svg&&getComputedStyle(svg).stroke,strokeWidth:svg?.getAttribute('stroke-width'),text:circle.textContent};
  }));
  assert.equal(new Set(data.slice(0,3).map(item=>item.image)).size,3,'Use real bright/dark/gray SVG fixtures');
  for(const [index,item] of data.entries()){
    assert.equal(item.type,'checkbox');assert.equal(item.checked,index<selected);assert.equal(item.text,'','Checkbox uses SVG, never a character checkmark');
    const opacity=Number(item.opacity)*Number(item.imageOpacity);assert(Math.abs(opacity-(item.checked||!selected?1:.85))<.001,'Only unselected thumbnail pixels dim while selection is active');
    if(item.checked){assert.equal(item.shadow,'rgba(0, 0, 0, 0.25) 0px 0px 0px 1px, rgba(0, 0, 0, 0.35) 0px 1px 4px 0px');assert.equal(item.fill,item.brand);assert.equal(item.outlineColor,item.brand);assert.equal(item.outlineWidth,'3px');assert.equal(item.outlineStyle,'solid');assert.equal(item.outlineOffset,'2px');assert.equal(item.stroke,item.onBrand);assert.equal(item.svgOpacity,'1');const rgb=color=>color.match(/[\d.]+/g).slice(0,3).map(Number),lum=color=>rgb(color).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);assert((Math.max(lum(item.stroke),lum(item.fill))+.05)/(Math.min(lum(item.stroke),lum(item.fill))+.05)>=3,'Check glyph contrast');assert.equal(item.strokeWidth,'2.5');}
    else{assert.equal(item.fill,'rgba(0, 0, 0, 0.35)');assert.equal(item.border,'2px solid rgb(255, 255, 255)');assert.equal(item.shadow,'rgba(0, 0, 0, 0.2) 0px 0px 0px 1px');if(item.svgOpacity!==null)assert.equal(item.svgOpacity,'0');}
  }
  return data;
}

async function checkboxKeyboard(page) {
  const input=page.locator('.media-file-select input').first();await page.keyboard.press('Tab');await input.focus();
  const focus=await input.evaluate(el=>{const label=el.closest('label'),css=getComputedStyle(label);return{native:el.tagName,type:el.type,focusVisible:el.matches(':focus-visible'),outlineWidth:css.outlineWidth,outlineOffset:css.outlineOffset,outlineColor:css.outlineColor,brand:getComputedStyle(label).getPropertyValue('--ui-brand')};});
  assert.equal(focus.native,'INPUT');assert.equal(focus.type,'checkbox');assert(focus.focusVisible);assert.equal(focus.outlineWidth,'2px');assert.equal(focus.outlineOffset,'2px');
  const brand=await input.evaluate(el=>{const probe=document.createElement('span');probe.style.color=getComputedStyle(el).getPropertyValue('--ui-brand');el.after(probe);const color=getComputedStyle(probe).color;probe.remove();return color;});assert.equal(focus.outlineColor,brand);
  await page.keyboard.press('Space');assert(!await input.isChecked(),'Space clears native checkbox');await page.keyboard.press('Space');assert(await input.isChecked(),'Space reselects native checkbox');await countSelected(page,1);
  return focus;
}

async function checkboxMotion(page) {
  const input=page.locator('.media-file-select input').nth(2),svg=page.locator('.media-file-select span svg').nth(2);
  const snapshot=()=>svg.evaluate(el=>{const css=getComputedStyle(el);return{opacity:css.opacity,transform:css.transform,transition:css.transitionProperty,duration:css.transitionDuration,animation:css.animationName};});
  const reduced=await snapshot();assert.equal(reduced.transform,'none');assert(reduced.duration.split(',').every(value=>parseFloat(value)===0));assert.equal(reduced.animation,'none');
  await page.emulateMedia({reducedMotion:'no-preference'});await input.uncheck();await waitFor(()=>svg.evaluate(el=>getComputedStyle(el).opacity==='0'),'unchecked animation settled');
  const unchecked=await snapshot();assert.equal(unchecked.transform,'matrix(0.9, 0, 0, 0.9, 0, 0)');assert(unchecked.transition.split(',').every(value=>['opacity','transform'].includes(value.trim())));assert(unchecked.duration.split(',').some(value=>parseFloat(value)>0));
  await input.check();await waitFor(()=>svg.evaluate(el=>getComputedStyle(el).opacity==='1'&&getComputedStyle(el).transform==='matrix(1, 0, 0, 1, 0, 0)'),'checked animation settled');const checked=await snapshot();
  await page.emulateMedia({reducedMotion:'reduce'});const restored=await snapshot();assert.equal(restored.transform,'none');assert(restored.duration.split(',').every(value=>parseFloat(value)===0));await countSelected(page,3);return{reduced,unchecked,checked,restored};
}

async function solidAppearance(page, control, withHover=true) {
  const snapshot=()=>control.evaluate(el=>{const body=getComputedStyle(el),face=getComputedStyle(el,'::before'),canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');const rgba=color=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};const pseudo=face.content!=='none'&&rgba(face.backgroundColor)[3]>0;return{fill:rgba(pseudo?face.backgroundColor:body.backgroundColor),text:rgba(body.color),pseudo,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height};});
  await page.mouse.move(0,0);const normal=await snapshot();assert.deepEqual(normal.fill,[244,243,238,255]);assert.deepEqual(normal.text,[20,20,19,255]);assert(normal.width>=44&&normal.height>=44);
  if(withHover)await control.hover();const hover=withHover?await snapshot():null;if(hover){assert.deepEqual(hover.text,[20,20,19,255]);assert(hover.fill.slice(0,3).every((v,i)=>v<normal.fill[i]&&v>=normal.fill[i]-40),'Dark solid hover should be slightly darker');}
  const lum=rgb=>rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0),contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  normal.contrast=contrast(normal.fill,normal.text);if(hover)hover.contrast=contrast(hover.fill,hover.text);assert(normal.contrast>=4.5&&(!hover||hover.contrast>=4.5));await page.mouse.move(0,0);return{normal,hover};
}

async function switchContrast(control) {
  const data=await control.evaluate(el=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d'),ancestors=[];for(let node=el;node;node=node.parentElement)ancestors.unshift(node);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,1,1);for(const node of ancestors){ctx.fillStyle=getComputedStyle(node).backgroundColor;ctx.fillRect(0,0,1,1);}const surface=[...ctx.getImageData(0,0,1,1).data];
    ctx.fillStyle=getComputedStyle(el,'::before').backgroundColor;ctx.fillRect(0,0,1,1);const track=[...ctx.getImageData(0,0,1,1).data];ctx.fillStyle=getComputedStyle(el.querySelector('span')).backgroundColor;ctx.fillRect(0,0,1,1);const thumb=[...ctx.getImageData(0,0,1,1).data];
    const lum=rgb=>rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);return{checked:el.getAttribute('aria-checked'),surface,track,thumb,contrast:(Math.max(lum(track),lum(thumb))+.05)/(Math.min(lum(track),lum(thumb))+.05)};
  });assert(data.contrast>=3,'Switch thumb against actual composited track under3: '+JSON.stringify(data));return data;
}

async function hitTargets(root) {
  for (const element of await root.locator('button,a,input[type=checkbox]').all()) {
    if (!await element.isVisible()) continue;
    const box = await element.boundingBox();
    assert(box.width >= 43.5 && box.height >= 43.5, `Target under44: ${await element.getAttribute('aria-label') || await element.textContent()} ${box.width}x${box.height}`);
  }
}

async function noOverflow(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Horizontal overflow');
}

async function barLayout(page, width) {
  const data = await bar(page).evaluate(element => {
    const rect = element.getBoundingClientRect(), css = getComputedStyle(element);
    const actions = element.querySelector('.media-batch-actions');
    return { rect: rect.toJSON(), gap: css.gap, padding: css.padding, radius: css.borderRadius, transform: css.transform,
      actions: actions?.getBoundingClientRect().toJSON(), actionsGap: actions && getComputedStyle(actions).gap,
      oldDesktopCount: document.querySelectorAll('.media-batch-desktop').length,
      statusCount: element.querySelectorAll('[role=status]').length,
      statusFont: getComputedStyle(element.querySelector('[role=status]')).fontSize,statusWeight:getComputedStyle(element.querySelector('[role=status]')).fontWeight,
      content: document.querySelector('.admin-main').getBoundingClientRect().toJSON(),
      status: [...element.querySelectorAll('[role=status]')].find(status => status.getBoundingClientRect().width > 0).getBoundingClientRect().toJSON(),
      buttons: [...element.querySelectorAll('button')].filter(button => button.getBoundingClientRect().width > 0).map(button => ({
        label: button.getAttribute('aria-label') || button.textContent, rect: button.getBoundingClientRect().toJSON(),
      })) };
  });
  await hitTargets(bar(page));
  assert.equal(data.oldDesktopCount, 0, 'The duplicated desktop batch markup must be removed');
  assert.equal(data.statusCount, 1, 'Exactly one shared live selection status');assert.equal(data.statusFont,'15px');assert.equal(data.statusWeight,'600');
  assert(data.actions, 'All widths use the shared batch actions');
  assert.equal(data.rect.height, 56, 'Unified batch bar height');
  assert.equal(data.radius, '16px');
  assert.equal(data.padding, '6px 8px');
  assert.equal(data.gap, '4px');
  assert.equal(data.actionsGap, '4px');
  assert.equal(data.buttons.length, 3, 'Unified bar shows three actions and one selection status');
  assert(data.buttons.every(button => Math.abs(button.rect.y - data.buttons[0].rect.y) < 1), 'Batch bar wrapped');
  const ordered = [...data.buttons].sort((a, b) => a.rect.x - b.rect.x);
  assert.equal(ordered[0].label, '清空选择');
  assert(ordered[0].rect.right <= data.status.left && data.status.right <= ordered[1].rect.left, 'Batch order must be clear / count / action / action');
  if (ordered[2].label === '删除到回收站') assert(Math.abs(ordered[2].rect.left - ordered[1].rect.right - 12) < 1, 'Select-all to trash separation must be12px');
  assert(data.buttons.every(button => button.rect.left >= data.rect.left && button.rect.right <= data.rect.right), 'Action protrudes beyond batch-bar surface');
  if (width <= 600) {
    assert(Math.abs(data.rect.left - 16) < 1 && Math.abs(data.rect.right - (width - 16)) < 1, 'Mobile bar must have16px side insets');
    assert.equal(data.transform, 'none');
    assert(Math.abs(await page.evaluate(() => innerHeight) - data.rect.bottom - 16) < 1, 'Mobile safe-area bottom inset');
  } else {
    assert(data.rect.width <= 568, 'Desktop batch bar max-width568');
    assert(Math.abs((data.rect.left + data.rect.right) / 2 - (data.content.left + data.content.right) / 2) < 1, 'Desktop batch bar centered within main content');
  }
  await page.locator('.admin-main').evaluate(element => { element.scrollTop = element.scrollHeight; return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const last = await page.locator('.media-file').last().boundingBox(), end = await page.locator('.media-page-end').boundingBox();
  const fixed = await bar(page).boundingBox();
  data.bottomVisibility = { last, end, fixed };
  assert(last.y + last.height <= fixed.y - 8, 'Fixed bar obscures the last media item at the bottom');
  assert(end.y + end.height <= fixed.y - 8, 'Fixed bar obscures the end-of-list message');
  data.bottomActionHits = [];
  for (const button of await bar(page).getByRole('button').all()) {
    if (!await button.isVisible()) continue;
    const hits = await button.evaluate(element => {
      const rect = element.getBoundingClientRect();return [0.1,0.5,0.9].map(fraction=>{const target=document.elementFromPoint(rect.x+rect.width*fraction,rect.y+rect.height/2);return{label:element.getAttribute('aria-label')||element.textContent,fraction,x:rect.x+rect.width*fraction,y:rect.y+rect.height/2,passed:!!target&&(target===element||element.contains(target)),actual:target?.closest('button')?.getAttribute('aria-label')||target?.closest('button')?.textContent||target?.tagName};});
    });
    data.bottomActionHits.push(...hits);log(JSON.stringify({width,scrolledActionHits:hits}));
    assert(hits.every(hit=>hit.passed), 'Scrolled batch target blocked: '+JSON.stringify(hits.filter(hit=>!hit.passed)));
  }
  await page.locator('.admin-main').evaluate(element => { element.scrollTop = 0; });
  await waitFor(() => page.locator('.admin-back-top').count().then(count => count === 0), 'back-to-top removed after scrolling to top');
  await noOverflow(page);
  return data;
}

async function toolbarLayout(page, width) {
  const data = await page.evaluate(() => {
    const get = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
    return { search: get('.media-search-field'), sort: get('.media-sort-trigger'), refresh: get('.media-refresh'), toolbar: get('.media-page-toolbar') };
  });
  if (width <= 480) {
    assert(Math.abs(data.search.left - data.toolbar.left) < 1 && Math.abs(data.search.right - data.toolbar.right) < 1, 'Small-screen search must occupy a full row');
    assert(data.sort.y >= data.search.bottom && data.refresh.y >= data.search.bottom, 'Sort and refresh must follow search');
    assert(Math.abs(data.sort.y - data.refresh.y) < 1, 'Sort and refresh must share a row');
    assert(Math.abs(data.refresh.right - data.toolbar.right) < 1, 'Refresh aligns to toolbar right');
  }
  return data;
}

async function cancelConfirmation(page, expected, touch=true) {
  const dialog = page.getByRole('alertdialog');
  await dialog.waitFor();
  assert.match(await dialog.innerText(), expected);
  await dialog.getByRole('button', { name: '取消', exact: true })[touch?'tap':'click']();
  await dialog.waitFor({ state: 'hidden' });
}

async function scenario(name, width, dark, touch, task) {
  if(process.env.MEDIA_TOUCH_CASE && name!==process.env.MEDIA_TOUCH_CASE)return;
  const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: touch, isMobile: touch, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage(), shared = createFixture(), media = fixture(), row = { name, width, dark, touch, passed: false, screenshots: [] };
  results.push(row);
  const errors = [], blockedExternal = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === target.origin) return route.continue();
    blockedExternal.push(url.origin); return route.abort();
  });
  await page.addInitScript(dark => {try{localStorage.setItem('mooncci-theme', dark ? 'dark' : 'light');}catch{}}, dark);
  await shared.install(page); await media.install(page);
  page.setDefaultTimeout(10000);
  const shot = async label => { const filename = `${width}-${dark ? 'dark' : 'light'}-${label}.png`; await page.screenshot({ path: path.join(OUT, filename) }); row.screenshots.push(filename); };
  log('START Chrome touch', name);
  try {
    await page.goto(BASE + '/admin/media', { waitUntil: 'domcontentloaded' });
    await page.locator('.media-file').first().waitFor();await waitFor(()=>page.locator('.media-file-image img').first().evaluate(el=>el.complete&&el.naturalWidth===1600),'real SVG fixture loaded');
    await waitFor(() => page.getByRole('button', { name: '刷新媒体库', exact: true }).isEnabled(), 'list loaded');
    row.inputCapabilities = await page.evaluate(() => ({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints,
      hoverNone: matchMedia('(hover: none)').matches, hoverHover: matchMedia('(hover: hover)').matches,
      pointerCoarse: matchMedia('(pointer: coarse)').matches, pointerFine: matchMedia('(pointer: fine)').matches }));
    assert.match(row.inputCapabilities.userAgent, /Chrome\//);
    assert(!/Edg\//.test(row.inputCapabilities.userAgent), 'Edge must not be substituted for Chrome');
    assert.equal(row.inputCapabilities.hoverNone, touch, 'Actual hover capability must match the test');
    assert.equal(row.inputCapabilities.pointerCoarse, touch);
    assert.equal(row.inputCapabilities.pointerFine, !touch);
    if (touch) assert(row.inputCapabilities.maxTouchPoints > 0);
    await hitTargets(page.locator('.media-page-actions'));
    await task({ page, media, row, shot });
    await noOverflow(page);
    assert.deepEqual(errors, []);
    assert.equal(media.requests.filter(request => request.method !== 'GET').length, 0, 'Cancelling must never write media');
    const otherWrites=shared.requests.filter(request=>request.method!=='GET');row.fixtureDraftWrites=otherWrites.map(request=>({method:request.method,path:request.path}));assert(otherWrites.every(request=>name.startsWith('dark-solid-posts-writing')&&request.method==='PUT'&&request.path==='/api/article-drafts/'+ID),'Only isolated draft autosaves allowed in cross-page switch checks');
    row.passed = true; log('PASS Chrome touch', name);
  } catch (error) {
    row.error = error.stack;
    await shot('FAIL-' + name).catch(() => {});
    log('FAIL Chrome touch', name, error.stack);
  } finally {
    row.runtimeErrors = errors; row.blockedExternal = blockedExternal; row.requests = media.requests;
    await context.close();
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ startedAt, browser: browser.version(), channel: 'chrome', browserMetadata, buildIndexSha256,
      buildUnchanged: hash(distIndex) === buildIndexSha256, passed: results.every(result => result.passed), fixtureOnly: true, productionWrites: false, imageFixtures:{bright:'#ffffff',dark:'#000000',gray:'#858585',format:'local SVG'},limitations:['Chrome touch emulation; no physical phone tested.'], results }, null, 2) + '\n');
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'run.log'), '');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const cdp = await browser.newBrowserCDPSession();
    const version = await cdp.send('Browser.getVersion');
    const command = await cdp.send('Browser.getBrowserCommandLine');
    browserMetadata = { ...version, executable: command.arguments[0] };
    assert.equal(browserMetadata.executable.replaceAll('\\', '/').toLowerCase(), 'c:/program files/google/chrome/application/chrome.exe');
    await cdp.detach();
    for (const dark of [false, true]) await scenario(`390-${dark ? 'dark' : 'light'}`, 390, dark, true, async ({ page, row, shot }) => {
      assert.equal(await page.locator('.media-file').count(), 20);
      assert.equal(await page.locator('.media-card-actions').count(), 0, 'Touch default must not render overlays');
      for (const checkbox of await page.locator('.media-file-select input').all()) assert(!await checkbox.isVisible(), 'Touch default checkbox must be hidden');
      row.normalCheckboxes=await checkboxAppearance(page,0);await shot('default');
      await thumb(page).tap(); await panel(page).waitFor();
      await panel(page).getByRole('button', { name: '关闭弹窗', exact: true }).tap(); await panel(page).waitFor({ state: 'hidden' });
      row.toolbar = await toolbarLayout(page, 390);
      await page.getByRole('button', { name: '最近更新', exact: true }).tap();
      const sort = page.getByRole('menu'); await sort.waitFor();
      const choices = sort.locator('[role=menuitemradio],[role=menuitem]');
      assert.equal(await choices.count(), 1); assert.match(await choices.first().innerText(), /最近更新/);
      await hitTargets(sort); await shot('sort-open'); await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '选择', exact: true }).tap();
      await thumb(page).tap(); await countSelected(page, 1); row.selectionTarget = await selectionTarget(page); row.selected1 = await barLayout(page, 390); await shot('selected-1');
      await thumb(page, 1).tap(); await thumb(page, 2).tap(); await countSelected(page, 3); row.selectedCheckboxes=await checkboxAppearance(page,3);row.selected3 = await barLayout(page, 390); await shot('selected-3');
      await bar(page).getByRole('button', { name: '删除到回收站', exact: true }).tap();
      await cancelConfirmation(page, /确定将选中的 3 个文件移入回收站/); await countSelected(page, 3);
      await bar(page).getByRole('button', { name: '全选本页', exact: true }).tap(); await countSelected(page, 20);
      await page.getByRole('button', { name: '完成', exact: true }).tap(); await bar(page).waitFor({ state: 'hidden' });
      await page.locator('.media-status-tabs').getByRole('button', { name: /^回收站/ }).tap();
      await waitFor(() => page.locator('.media-file').count().then(count => count === 3), 'trash');
      await page.getByRole('button', { name: '选择', exact: true }).tap(); await thumb(page).tap(); await countSelected(page, 1);
      row.trash = await barLayout(page, 390); assert(await bar(page).getByRole('button', { name: '恢复', exact: true }).isVisible());
      await shot('trash-selected');
      await bar(page).locator('button[aria-haspopup=menu]').tap();
      const more = page.getByRole('menu'); await more.waitFor();
      assert(await more.getByRole('menuitem', { name: '全选本页', exact: true }).isVisible());
      await more.getByRole('menuitem', { name: '彻底删除', exact: true }).tap();
      await cancelConfirmation(page, /确定彻底删除选中的 1 个文件.*不可恢复/);
      await countSelected(page, 1);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));row.trashCancelFocus=await page.evaluate(()=>({tag:document.activeElement.tagName,label:document.activeElement.getAttribute('aria-label'),text:document.activeElement.textContent?.slice(0,60)}));assert.equal(row.trashCancelFocus.label,'更多批量操作','Trash permanent-delete cancellation restores More trigger');
    });

    for(const [width,dark] of [[1440,false],[1024,false],[1440,true]]) await scenario(`desktop-hover-${width}-${dark?'dark':'light'}`, width, dark, false, async ({ page, row, shot }) => {
      const actions = page.locator('.media-file').first().locator('.media-card-actions');
      assert.equal(await actions.count(), 1);if(dark)row.mediaSolid=await solidAppearance(page,page.getByRole('button',{name:'上传图片',exact:true}));
      assert.equal(await actions.evaluate(element => getComputedStyle(element).opacity), '0');
      await page.mouse.move(0, 0); await thumb(page).focus();
      await waitFor(() => actions.evaluate(element => Number(getComputedStyle(element).opacity) === 1), 'desktop keyboard focus actions');
      row.focusOverlay = await actions.evaluate(element => ({ opacity: getComputedStyle(element).opacity, buttonsInteractive: [...element.querySelectorAll('button')].every(button => getComputedStyle(button).pointerEvents === 'auto') }));
      assert(row.focusOverlay.buttonsInteractive);
      await page.evaluate(() => document.activeElement.blur());
      await thumb(page).hover(); await waitFor(() => actions.evaluate(element => Number(getComputedStyle(element).opacity) === 1), 'desktop hover actions');
      row.normalCheckboxes=await checkboxAppearance(page,0);await shot('hover');
      await page.locator('.media-file-select input').first().check(); await countSelected(page, 1);
      row.selectionTarget = await selectionTarget(page);
      row.bar = await barLayout(page, width);
      assert(Math.abs(1000 - row.bar.rect.bottom - 16) < 1, 'Unified bar uses16px bottom inset');
      await shot('selected-1');row.keyboard=await checkboxKeyboard(page);row.selectionTarget=await selectionTarget(page);for(const index of [1,2])await page.locator('.media-file-select input').nth(index).check();await countSelected(page,3);row.selectedCheckboxes=await checkboxAppearance(page,3);if(width===1440)row.checkboxMotion=await checkboxMotion(page);await shot('selected-3');
      await bar(page).getByRole('button', { name: '删除到回收站', exact: true }).click();
      await cancelConfirmation(page, /确定将选中的 3 个文件移入回收站/, false);
      await bar(page).getByRole('button', { name: '清空选择', exact: true }).click();
      await page.locator('.media-status-tabs').getByRole('button', { name: /^回收站/ }).click();
      await waitFor(() => page.locator('.media-file').count().then(count => count === 3), 'desktop trash');
      await thumb(page).hover(); await page.locator('.media-file-select input').first().check(); await countSelected(page, 1);
      row.trash = await barLayout(page, width); await shot('trash-selected');
      await bar(page).getByRole('button', { name: '更多批量操作', exact: true }).click();
      await page.getByRole('menuitem', { name: '彻底删除', exact: true }).click();
      await cancelConfirmation(page, /确定彻底删除选中的 1 个文件.*不可恢复/, false); await countSelected(page, 1);
    });

    for (const width of [600, 601]) await scenario(`boundary-${width}`, width, false, true, async ({ page, row, shot }) => {
      await page.getByRole('button', { name: '选择', exact: true }).tap(); await thumb(page).tap(); await countSelected(page, 1);
      row.bar = await barLayout(page, width); await shot('boundary-selected');
    });
    await scenario('tablet-selection-right', 768, false, true, async ({ page, row, shot }) => {
      const toggle = page.getByRole('button', { name: '选择', exact: true });
      row.headerActions = await page.locator('.media-page-actions').boundingBox();
      row.selectionButton = await toggle.boundingBox();
      assert(Math.abs(row.selectionButton.x + row.selectionButton.width - row.headerActions.x - row.headerActions.width) < 1, 'Tablet selection button must align with header-actions right edge');
      await toggle.tap(); await thumb(page).tap(); await countSelected(page, 1); await shot('selection-right');
    });
    for(const width of [1440,390])await scenario('dark-solid-posts-writing-'+width,width,true,width===390,async({page,row,shot})=>{
      row.mediaSolid=await solidAppearance(page,page.getByRole('button',{name:'上传图片',exact:true}),width>=768);
      await page.goto(BASE+'/admin/posts',{waitUntil:'domcontentloaded'});const posts=page.locator('.admin-posts-page').getByRole('link',{name:'写文章',exact:true}).first();await posts.waitFor();row.postsSolid=await solidAppearance(page,posts,width>=768);await shot('posts-solid');
      await page.goto(BASE+'/admin/write?draft='+ID,{waitUntil:'domcontentloaded'});await page.locator('.tiptap[contenteditable=true]').waitFor();await page.locator('.writing-save-state[data-state=saved]').waitFor();const publish=page.getByRole('button',{name:'发布',exact:true});await waitFor(()=>publish.isEnabled(),'writing ready');row.writingSolid=await solidAppearance(page,publish,width>=768);await shot('writing-solid');
      if(width<768){await page.getByRole('button',{name:'更多文章操作',exact:true}).tap();await page.getByRole('menuitem',{name:'文章设置',exact:true}).tap();}
      const settings=width<768?page.getByRole('dialog',{name:'文章设置',exact:true}):page.locator('.writing-settings'),toggle=settings.getByRole('switch');await toggle.scrollIntoViewIfNeeded();row.switchOff=await switchContrast(toggle);assert.equal(row.switchOff.checked,'false');await toggle.click();row.switchOn=await switchContrast(toggle);assert.equal(row.switchOn.checked,'true');await shot('switch-checked');await toggle.click();row.switchRestored=await switchContrast(toggle);if(width<768){await page.keyboard.press('Escape');await settings.waitFor({state:'hidden'});}
      await page.locator('.article-image-trigger').click();const choices=width<768?page.getByRole('dialog',{name:'正文图片',exact:true}):page.locator('.article-image-menu');await choices.getByRole(width<768?'button':'menuitem',{name:'插入链接',exact:true}).click();const dialog=page.getByRole('dialog',{name:'插入图片链接',exact:true});await dialog.waitFor();row.imageLinkSolid=await solidAppearance(page,dialog.getByRole('button',{name:'插入图片',exact:true}),width>=768);await shot('image-link-solid');await dialog.getByRole('button',{name:'取消',exact:true}).click();await dialog.waitFor({state:'hidden'});
    });
    assert.equal(hash(distIndex), buildIndexSha256, 'Build changed during Chrome acceptance');
    const summary = { passed: results.every(result => result.passed), browser: browser.version(), channel: 'chrome', scenarios: results.length,
      screenshots: results.flatMap(result => result.screenshots).length, failed: results.filter(result => !result.passed).map(result => ({ name: result.name, error: result.error })), report: path.join(OUT, 'report.json') };
    log(JSON.stringify(summary, null, 2)); if (!summary.passed) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
