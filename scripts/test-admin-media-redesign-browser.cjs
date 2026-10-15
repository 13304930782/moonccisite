const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createFixture,launch,OUT,now}=require('./fixtures/admin-redesign.cjs');
const BASE=process.env.ADMIN_REDESIGN_URL||'http://127.0.0.1:5195';
const target=new URL(BASE);
assert(['127.0.0.1','localhost'].includes(target.hostname)&&target.protocol==='http:','Only a local built preview is allowed');
const output=path.join(OUT,'media-qa'),results=[];
const capturedAt=new Date().toISOString(),distIndex=path.join(__dirname,'../dist/index.html');
const distIndexSha256=()=>crypto.createHash('sha256').update(fs.readFileSync(distIndex)).digest('hex');
const buildIndexSha256=distIndexSha256();
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1sAAAAASUVORK5CYII=','base64');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){if(await fn())return;await delay(30);}throw Error('Timed out: '+label);}
const clone=value=>JSON.parse(JSON.stringify(value));
const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
function makeItem(id,status='active'){return {id,filename:`fixture-${String(id).padStart(2,'0')}.webp`,display_name:`媒体展示图 ${String(id).padStart(2,'0')}`,alt_text:`第 ${id} 张测试图片`,url:'/qa-cover.svg',size:20480+id,size_text:'20 KB',uploaded_at:now,updated_at:now,width:1600,height:900,status,ext:'.webp',mime:'image/webp',quality:'medium'};}
function mediaFixture(){
 const state={items:[...Array.from({length:20},(_,i)=>makeItem(i+1)),makeItem(21,'trashed'),makeItem(22,'trashed')],requests:[],renameFailures:0,deleteConflict:false,batchConflict:false,holdPut:false,putRelease:null,queryHolds:new Map()};
 state.active=()=>state.items.filter(x=>x.status==='active');
 state.install=async page=>{
  await page.route('**/api/upload/**',async route=>{
   const req=route.request(),u=new URL(req.url()),method=req.method(),pathname=u.pathname;
   const row={path:pathname,method,query:Object.fromEntries(u.searchParams),body:null,status:0};state.requests.push(row);
   const send=(status,body)=>{row.status=status;return route.fulfill({status,json:clone(body)});};
   const isJson=(req.headers()['content-type']||'').includes('application/json');if(isJson&&req.postData())row.body=req.postDataJSON();
   if(pathname==='/api/upload/image'){
    const raw=req.postData()||'',quality=/name="quality"\r\n\r\n([^\r\n]+)/.exec(raw)?.[1];row.body={quality,hasImage:/name="image"; filename=/.test(raw)};
    assert(['low','medium','high','original'].includes(quality));const item=makeItem(Math.max(...state.items.map(x=>x.id))+1);item.quality=quality;state.items.unshift(item);return send(200,{...item,url:item.url});
   }
   if(pathname==='/api/upload/media'&&method==='GET'){
    const q=(u.searchParams.get('q')||'').toLocaleLowerCase(),status=u.searchParams.get('status')||'active',size=Number(u.searchParams.get('pageSize')||50);
    const rows=state.items.filter(x=>x.status===status&&[x.filename,x.display_name,x.alt_text].some(v=>String(v||'').toLocaleLowerCase().includes(q)));
    const total=rows.length,page=Math.min(Math.max(1,Number(u.searchParams.get('page')||1)),Math.max(1,Math.ceil(total/size)));
    const body={items:clone(rows.slice((page-1)*size,page*size)),total,page,pageSize:size};
    if(state.queryHolds.has(q)){const held=state.queryHolds.get(q);held.requested=true;await held.promise;}
    return send(200,body);
   }
   const batch=/^\/api\/upload\/media\/batch\/(delete|restore|permanent)$/.exec(pathname);
   if(batch){
    const names=row.body?.filenames;assert(Array.isArray(names));
    if(batch[1]==='delete'&&state.batchConflict&&!row.body.force)return send(409,{message:'测试文件仍被文章引用'});
    if(batch[1]==='permanent')state.items=state.items.filter(x=>!names.includes(x.filename));
    else for(const item of state.items)if(names.includes(item.filename))item.status=batch[1]==='restore'?'active':'trashed';
    return send(200,{message:'隔离批量操作完成'});
   }
   const match=/^\/api\/upload\/media\/([^/]+)(?:\/(rename|recompress|restore|permanent))?$/.exec(pathname);
   if(!match)return send(404,{message:'Unexpected mocked upload endpoint'});
   const filename=decodeURIComponent(match[1]),action=match[2],item=state.items.find(x=>x.filename===filename);
   if(!item)return send(404,{message:'测试文件不存在'});
   if(method==='PUT'&&!action){
    if(state.holdPut)await new Promise(resolve=>{state.putRelease=resolve;});
    Object.assign(item,{display_name:row.body.display_name,alt_text:row.body.alt_text});return send(200,item);
   }
   if(action==='rename'){
    if(state.renameFailures-->0)return send(400,{message:'测试：文件名被占用'});
    item.filename=row.body.filename;return send(200,item);
   }
   if(action==='recompress'){
    assert(['low','medium','high'].includes(row.body.quality));item.filename=item.filename.replace(/\.webp$/,`-${row.body.quality}.webp`);item.quality=row.body.quality;item.size=10240;item.size_text='10 KB';return send(200,item);
   }
   if(action==='restore'){item.status='active';return send(200,{ok:true});}
   if(action==='permanent'){state.items=state.items.filter(x=>x!==item);return send(200,{ok:true});}
   if(method==='DELETE'){
    if(state.deleteConflict&&!u.searchParams.has('force'))return send(409,{message:'测试文件仍被文章引用'});
    item.status='trashed';return send(200,{ok:true});
   }
   return send(400,{message:'Unexpected mocked media mutation'});
  });
 };
 return state;
}
function writes(state){return state.requests.filter(x=>x.method!=='GET');}
function drawer(page){return page.locator('.media-detail-drawer');}
async function ready(page){await page.locator('.media-file').first().waitFor();await until(()=>page.getByRole('button',{name:'刷新媒体库',exact:true}).isEnabled(),'media loaded');}
async function choose(page,index=0){await page.locator('.media-file-image').nth(index).hover();await page.locator('.media-file-select input').nth(index).check();}
async function open(page,index=0){const trigger=page.locator('.media-detail-trigger').nth(index);await trigger.hover();assert(await trigger.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!hit&&(hit===el||el.contains(hit));}),'image center is intercepted by the action overlay');await trigger.click();await drawer(page).waitFor();return trigger;}
async function confirm(page,accept=true){const dialog=page.getByRole('alertdialog');await dialog.waitFor();const previous=await dialog.innerText();await dialog.getByRole('button',{name:accept?'确认继续':'取消',exact:true}).click();await until(async()=>!await dialog.isVisible()||await dialog.innerText()!==previous,'confirmation closed or next confirmation');}
async function chooseQuality(page,label,option){await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('menuitemradio',{name:option,exact:true}).click();}
async function bounds(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal page overflow');if(await drawer(page).count())assert(await drawer(page).evaluate(el=>el.scrollWidth<=el.clientWidth+1),'drawer overflow');}
async function targets(page,root){
 for(const control of await root.locator('button,a,input[type=checkbox]').all()){
  const box=await control.boundingBox();if(box&&await control.isVisible())assert(box.width>=43.5&&box.height>=43.5,`44px target ${await control.getAttribute('aria-label')||await control.textContent()} (${box.width}x${box.height})`);
 }
}
async function compactFaces(root){
 for(const button of await root.locator('.admin-button:not(.admin-icon-button):not(.media-selection-toggle),.media-status-tabs>button').all()){
  if(!await button.isVisible())continue;
  const visual=await button.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return {height:parseFloat(getComputedStyle(el,'::before').height),hit:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,ink:range.getBoundingClientRect().height};});
  assert.equal(visual.height,32,'filled control face must be compact');assert(visual.hit>=44,'compact face lost its touch target');assert(visual.width>=64,'short labels must not become narrow vertical blocks');assert(visual.ink<=visual.height+1,'wrapped label must fit within its visible face');
 }
}
async function themeColors(page,dark){
 const colors=await page.evaluate(()=>{
  const context=document.createElement('canvas').getContext('2d');
  const rgba=value=>{context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data];};
  const background=rgba(getComputedStyle(document.querySelector('.admin-frame')).backgroundColor);
  const painted=(element,pseudo)=>{const style=getComputedStyle(element,pseudo),fill=rgba(style.backgroundColor),a=fill[3]/255;return {background:fill.slice(0,3).map((v,i)=>v*a+background[i]*(1-a)),text:rgba(style.color).slice(0,3)};};
  const bar=document.querySelector('.media-batch-bar'),primary=document.querySelector('.media-page-actions .admin-button--solid'),overlay=document.querySelector('.media-card-actions');
  return {theme:document.documentElement.dataset.moonTheme,dark:document.documentElement.classList.contains('dark'),scheme:document.documentElement.style.colorScheme,background:background.slice(0,3),bar:bar?painted(bar):null,danger:bar?rgba(getComputedStyle(bar.querySelector('.media-batch-danger')).color).slice(0,3):null,primary:painted(primary,'::before'),overlay:overlay?getComputedStyle(overlay).backgroundImage:null,overlayText:overlay?rgba(getComputedStyle(overlay.querySelector('button')).color).slice(0,3):null};
 });
 const brightness=rgb=>rgb.reduce((sum,v)=>sum+v,0)/3;
 assert.equal(colors.theme,dark?'dark':'light');assert.equal(colors.dark,dark);assert.equal(colors.scheme,dark?'dark':'light');
 assert(dark?brightness(colors.background)<64:brightness(colors.background)>200,'page theme is incomplete');
 if(colors.bar)assert(dark?brightness(colors.bar.background)<64:brightness(colors.bar.background)>200,'batch bar is inverted against the page theme');
 if(dark){assert.deepEqual(colors.primary.background,[244,243,238],'dark primary uses the requested warm light face');assert.deepEqual(colors.primary.text,[20,20,19],'dark primary uses the requested dark label');}
 assert(contrast(colors.primary.text,colors.primary.background)>=4.5,'primary label contrast is too low');
 if(colors.bar){assert(contrast(colors.bar.text,colors.bar.background)>=4.5,'batch label contrast is too low');assert(contrast(colors.danger,colors.bar.background)>=4.5,'batch danger text contrast is too low');}
 if(colors.overlay){assert.match(colors.overlay,/rgba?\(0, 0, 0[,) ]/,'photo overlay must darken, not whiten images');assert(colors.overlayText.every(v=>v>=245),'photo overlay text must stay legible');}
 return colors;
}
async function scenario(name,width,fn,{dark=false,matrix=false}={}){
 const context=await browser.newContext({viewport:{width,height:1000},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage(),shared=createFixture(),state=mediaFixture(),row={name,width,dark,passed:false,steps:[]};results.push(row);page.setDefaultTimeout(10000);
 const errors=[],external=[],downloads=[];
 await context.route('**/qa-cover.svg',route=>route.fulfill({contentType:'image/png',body:png}));
 page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d.suggestedFilename()));
 await page.route('https://**',route=>{external.push(new URL(route.request().url()).origin);return route.abort();});
 await page.addInitScript(dark=>{localStorage.setItem('mooncci-theme',dark?'dark':'light');window.__mediaClipboard=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__mediaClipboard.push(text);}}});},dark);
 await shared.install(page);await state.install(page);
 console.log('START media '+name);
 try{
  await page.goto(BASE+'/admin/media',{waitUntil:'domcontentloaded'});await ready(page);
  await fn({page,context,state,shared,step:(name,evidence)=>row.steps.push({name,evidence}),shot:async label=>{const file=`${width}-${dark?'dark':'light'}-${label}.png`;await page.screenshot({path:path.join(output,file),fullPage:true});row.steps.push({screenshot:file});}});
  await bounds(page);assert.deepEqual(errors,[]);assert.deepEqual(downloads,[]);row.passed=true;console.log('PASS media '+name);
 }catch(error){row.error=error.stack;row.body=await page.locator('body').innerText().catch(()=>'<unavailable>');row.failureScreenshot=name+'-FAIL.png';await page.screenshot({path:path.join(output,row.failureScreenshot),fullPage:true}).catch(()=>{});console.log('FAIL media '+name+': '+error.message);}
 finally{
  state.putRelease?.();for(const held of state.queryHolds.values())held.release();row.runtimeErrors=errors;row.blockedExternalRequests=external;row.downloads=downloads;row.mediaRequests=state.requests;row.otherRequests=shared.requests;row.finalItems=state.items;row.fixtureOnly=true;await context.close();
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:results.every(x=>x.passed),capturedAt,preview:BASE,buildIndexSha256,buildUnchanged:buildIndexSha256===distIndexSha256(),mode:'Local built preview, persistent isolated media API fixture; no production writes',results},null,2)+'\n');
 }
}
let browser;
(async()=>{
 fs.mkdirSync(output,{recursive:true});browser=await launch();
 try{
  for(const width of [1440,1024,390])for(const dark of [false,true])await scenario(`matrix-${width}-${dark?'dark':'light'}`,width,async({page,state,shot,step})=>{
   await page.waitForFunction(value=>document.documentElement.dataset.moonTheme===value,dark?'dark':'light');
   assert.equal(await page.locator('.media-file').count(),20);assert.equal(await page.locator('.media-status-tabs [aria-pressed=true]').evaluate(el=>getComputedStyle(el,'::before').backgroundColor),await page.evaluate(()=>{const el=document.createElement('span');el.style.background='var(--ui-fill-strong)';document.body.appendChild(el);const color=getComputedStyle(el).backgroundColor;el.remove();return color;}));
   const refresh=page.getByRole('button',{name:'刷新媒体库',exact:true});assert.equal(await refresh.count(),1,'exactly one visible refresh control');
   assert.equal(await page.locator('.media-refresh').count(),1,'refresh must use a single DOM control');assert(await refresh.evaluate(el=>!!el.closest('.media-page-toolbar')));assert.equal(await refresh.locator('svg').getAttribute('stroke-width'),'1.8');
   await refresh.hover();assert.equal(await refresh.evaluate(el=>getComputedStyle(el,'::before').backgroundColor),'rgba(0, 0, 0, 0)','refresh must not gain a mismatched filled box on hover');
   assert.equal(await page.locator('.media-page-actions button:visible').first().innerText(),'上传图片','upload comes before image quality on every viewport');
   if(width<=900){
    const alignment=await page.locator('.media-page-actions').evaluate(el=>({left:el.getBoundingClientRect().left,first:el.querySelector('button').getBoundingClientRect().left}));assert(Math.abs(alignment.first-alignment.left)<1,'mobile action row has leading empty space');
   }
   const before=state.requests.length;await refresh.click();await until(()=>state.requests.length>before&&refresh.isEnabled(),'refresh reloads');await compactFaces(page.locator('.admin-media-page'));step('normal theme colors',await themeColors(page,dark));
   await targets(page,page.locator('.admin-media-page'));for(const action of await page.locator('.media-card-actions button').first().all()){assert.equal(parseFloat(await action.evaluate(el=>getComputedStyle(el,'::before').height)),28,'action visual background must be 28px high');const hit=await action.boundingBox();assert.equal(hit.height,44,'action hit target must remain 44px high');}await bounds(page);await shot('normal');
   if(width===390)await page.getByRole('button',{name:'选择',exact:true}).click();await choose(page,0);await choose(page,1);const bar=page.getByRole('region',{name:'批量媒体操作'});await bar.waitFor();assert.match(await bar.innerText(),/已选 2 项/);await targets(page,bar);await compactFaces(bar);step('selected theme colors',await themeColors(page,dark));await shot('selection');
   await bar.getByRole('button',{name:'清空选择',exact:true}).click();if(width===390)await page.getByRole('button',{name:'完成',exact:true}).click();const trigger=await open(page);const panel=drawer(page),box=await panel.boundingBox();assert(Math.abs(box.width-Math.min(460,width))<1);const geometry=await page.evaluate(()=>({innerWidth,clientWidth:document.documentElement.clientWidth,bodyRight:document.body.getBoundingClientRect().right}));assert(Math.abs(box.x+box.width-geometry.bodyRight)<1,'drawer must align with scroll-locked body right edge');step('drawer geometry',{...geometry,drawer:box});await targets(page,panel);await bounds(page);
   await compactFaces(panel);
   const danger=await panel.locator('.media-danger').evaluate(el=>{const context=document.createElement('canvas').getContext('2d'),rgb=value=>{context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data].slice(0,3);};return {text:rgb(getComputedStyle(el).color),background:rgb(getComputedStyle(el.closest('.media-detail-drawer')).backgroundColor)};});
   assert(danger.text[0]>danger.text[1]+40&&danger.text[0]>danger.text[2]+40,'drawer delete must retain its danger text color');assert(contrast(danger.text,danger.background)>=4.5,'drawer danger text contrast is too low');step('drawer danger text contrast',{...danger,contrast:contrast(danger.text,danger.background)});
   if(width<=900)for(const input of await panel.locator('input').all())assert(parseFloat(await input.evaluate(el=>getComputedStyle(el).fontSize))>=16);
   await page.keyboard.press('Tab');assert(await panel.evaluate(el=>el.contains(document.activeElement)),'Tab escaped drawer');await shot('drawer');await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});await until(()=>trigger.evaluate(el=>el===document.activeElement),'drawer Escape focus');
   await page.locator('.media-status-tabs').getByRole('button',{name:'回收站',exact:false}).click();await until(()=>page.locator('.media-file').count().then(n=>n===2),'trash list');assert.equal(await bar.count(),0);await shot('trash');
   const search=page.getByRole('textbox',{name:'搜索媒体文件'});await search.fill('不存在的搜索');await page.getByText('没有找到匹配的媒体文件。',{exact:true}).waitFor();await shot('empty-search');assert(state.requests.some(r=>r.method==='GET'&&r.query.q==='不存在的搜索'));assert.equal(writes(state).length,0);
   const clear=page.getByRole('button',{name:'清除搜索',exact:true});assert.equal(await clear.count(),1);assert(await clear.evaluate(el=>!!el.closest('.media-search-field')));assert.equal(await clear.locator('svg').count(),1);assert.equal((await clear.innerText()).trim(),'');await clear.click();await until(()=>page.locator('.media-file').count().then(n=>n===2),'clear search reloads original status');assert.equal(await search.inputValue(),'');assert(await search.evaluate(el=>el===document.activeElement));assert.equal(await clear.count(),0);assert.equal(state.requests.at(-1).query.page,'1');assert.equal(state.requests.at(-1).query.q,'');step('read-only matrix and inline clear',{files:20,drawerWidth:box.width,requests:state.requests.length});
  },{dark,matrix:true});

  await scenario('upload-four-qualities',1440,async({page,state,step})=>{
   for(const [quality,name] of [['low','低清晰度'],['medium','中清晰度'],['high','高清晰度'],['original','原图']]){
    await chooseQuality(page,'上传图片质量',name);await page.getByLabel('上传图片文件',{exact:true}).setInputFiles({name:`${quality}.png`,mimeType:'image/png',buffer:png});await until(()=>state.requests.some(r=>r.path==='/api/upload/image'&&r.body.quality===quality),'upload '+quality);await until(()=>page.getByRole('button',{name:'上传图片',exact:true}).isEnabled(),'upload finished');
   }
   const uploads=writes(state).filter(r=>r.path==='/api/upload/image');assert.deepEqual(uploads.map(r=>r.body.quality),['low','medium','high','original']);assert(uploads.every(r=>r.body.hasImage));assert.equal(state.active().length,24);step('four multipart qualities',uploads);
  });

  await scenario('copy-safe-link-no-mutation',1440,async({page,context,state,step})=>{
   const item=clone(state.active()[0]);await page.locator('.media-file-image').first().hover();await page.getByRole('button',{name:`复制 ${item.display_name} 的 URL`,exact:true}).click();await page.getByRole('button',{name:`复制 ${item.display_name} 的 Markdown`,exact:true}).click();await open(page);
   const panel=drawer(page);await panel.getByRole('button',{name:'复制链接',exact:true}).click();await panel.getByRole('button',{name:'复制 Markdown',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.__mediaClipboard),[item.url,`![${item.alt_text}](${item.url})`,item.url,`![${item.alt_text}](${item.url})`]);
   const original=panel.getByRole('link',{name:'打开原图',exact:true});assert.equal(await original.getAttribute('target'),'_blank');assert.match(await original.getAttribute('rel'),/noopener/);assert.match(await original.getAttribute('rel'),/noreferrer/);const [popup]=await Promise.all([page.waitForEvent('popup'),original.click()]);await popup.waitForURL(new URL(item.url,BASE).href);await popup.waitForLoadState('domcontentloaded');assert.equal(new URL(popup.url()).pathname,'/qa-cover.svg');await popup.close();assert.equal(writes(state).length,0,'Copy/open triggered a media mutation');step('mock clipboard and safe original',await page.evaluate(()=>window.__mediaClipboard));
  });

  await scenario('metadata-rename-partial-failure-retry-busy',1440,async({page,state,step})=>{
   const item=state.active()[0];await open(page);const panel=drawer(page);await panel.getByLabel('链接显示名',{exact:true}).fill('保留输入的显示名');await panel.getByLabel('Alt 文本',{exact:true}).fill('保留输入的替代文本');await panel.getByLabel('文件名',{exact:true}).fill('renamed-fixture.webp');state.renameFailures=1;
   await panel.getByRole('button',{name:'保存显示信息',exact:true}).click();await panel.getByRole('alert').filter({hasText:'显示信息已保存，文件名修改失败'}).waitFor();assert.equal(item.display_name,'保留输入的显示名');assert.equal(await panel.getByLabel('文件名',{exact:true}).inputValue(),'renamed-fixture.webp');assert.equal(await panel.getByLabel('Alt 文本',{exact:true}).inputValue(),'保留输入的替代文本');
   state.holdPut=true;await panel.getByRole('button',{name:'保存显示信息',exact:true}).click();await until(()=>state.putRelease,'held metadata PUT');await page.keyboard.press('Escape');assert(await panel.isVisible(),'busy drawer closed on Escape');await panel.getByRole('button',{name:/^(Close|关闭弹窗)$/}).click();assert(await panel.isVisible(),'busy drawer closed from close button');assert(await panel.getByLabel('链接显示名',{exact:true}).isDisabled());state.holdPut=false;state.putRelease();state.putRelease=null;await until(()=>item.filename==='renamed-fixture.webp','rename retry');await until(()=>panel.getByRole('button',{name:'保存显示信息',exact:true}).isEnabled(),'save settled');assert.equal(await panel.getByLabel('文件名',{exact:true}).inputValue(),item.filename);assert.equal(writes(state).filter(r=>r.path.endsWith('/rename')).length,2);await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});await choose(page);assert(await page.locator('.media-file-select input').first().isChecked(),'renamed row is selectable');await page.getByRole('region',{name:'批量媒体操作'}).getByRole('button',{name:'删除到回收站',exact:true}).click();await confirm(page);await until(()=>item.status==='trashed','renamed selection deletion');assert.deepEqual(writes(state).find(r=>r.path==='/api/upload/media/batch/delete').body.filenames,['renamed-fixture.webp']);step('partial failure retry and selection',writes(state));
  });

  await scenario('recompress-three-qualities-and-selected-filename',1440,async({page,state,step})=>{
   const item=state.active()[0];await open(page);await drawer(page).getByLabel('链接显示名',{exact:true}).fill('压缩前尚未保存的名称');await drawer(page).getByLabel('Alt 文本',{exact:true}).fill('压缩前尚未保存的替代文本');
   for(const [quality,name] of [['low','低清晰度'],['medium','中清晰度'],['high','高清晰度']]){await chooseQuality(page,'压缩图片质量',name);assert.equal(await page.getByRole('menuitemradio',{name:'原图',exact:true}).count(),0);await drawer(page).getByRole('button',{name:'二次压缩',exact:true}).click();await until(()=>item.quality===quality,'recompress '+quality);await until(()=>drawer(page).getByRole('button',{name:'二次压缩',exact:true}).isEnabled(),'compression settled');assert.equal(await drawer(page).getByLabel('文件名',{exact:true}).inputValue(),item.filename);}
   assert.equal(await drawer(page).getByLabel('链接显示名',{exact:true}).inputValue(),'压缩前尚未保存的名称');assert.equal(await drawer(page).getByLabel('Alt 文本',{exact:true}).inputValue(),'压缩前尚未保存的替代文本');assert(!writes(state).some(r=>r.method==='PUT'),'compression submitted metadata form');await page.keyboard.press('Escape');await drawer(page).waitFor({state:'hidden'});await choose(page);assert(await page.locator('.media-file-select input').first().isChecked());const bar=page.getByRole('region',{name:'批量媒体操作'});await bar.getByRole('button',{name:'删除到回收站',exact:true}).click();await confirm(page);await until(()=>item.status==='trashed','delete recompressed selection');const batch=writes(state).find(r=>r.path==='/api/upload/media/batch/delete');assert.deepEqual(batch.body.filenames,[item.filename]);assert.deepEqual(writes(state).filter(r=>r.path.endsWith('/recompress')).map(r=>r.body.quality),['low','medium','high']);step('selection tracked renamed output and unsaved fields retained',writes(state));
  });

  await scenario('delete-confirm-conflict-cancel-force',1440,async({page,state,step})=>{
   const item=state.active()[0];await open(page);const panel=drawer(page);const remove=()=>panel.getByRole('button',{name:'删除到回收站',exact:true}).click();await remove();await confirm(page,false);assert.equal(writes(state).length,0,'cancelled first confirmation wrote metadata');
   state.deleteConflict=true;await remove();await confirm(page);const force=page.getByRole('alertdialog');await force.getByText(/强制删除会让文章里的图片链接失效/).waitFor();await confirm(page,false);assert.equal(item.status,'active');assert.equal(writes(state).length,1);assert(!writes(state).some(r=>r.query.force));
   await remove();await confirm(page);await page.getByRole('alertdialog').getByText(/强制删除会让文章里的图片链接失效/).waitFor();await confirm(page);await panel.waitFor({state:'hidden'});assert.equal(item.status,'trashed');assert(writes(state).some(r=>r.query.force==='1'));step('first and force confirmations',writes(state));
  });

  await scenario('batch-delete-restore-permanent',1440,async({page,state,step})=>{
   const names=state.active().slice(0,2).map(x=>x.filename);await choose(page,0);await choose(page,1);let bar=page.getByRole('region',{name:'批量媒体操作'});await bar.getByRole('button',{name:'删除到回收站',exact:true}).click();await confirm(page);await until(()=>names.every(n=>state.items.find(x=>x.filename===n).status==='trashed'),'batch trashed');
   await page.getByRole('button',{name:/^回收站/}).click();await until(()=>page.locator('.media-file').count().then(n=>n===4),'four trash files');await choose(page,0);await choose(page,1);bar=page.getByRole('region',{name:'批量媒体操作'});await bar.getByRole('button',{name:'恢复',exact:true}).click();await until(()=>names.every(n=>state.items.find(x=>x.filename===n).status==='active'),'batch restored');await until(()=>page.locator('.media-file').count().then(n=>n===2),'two original trash files');
   const trash=state.items.filter(x=>x.status==='trashed').map(x=>x.filename);await choose(page);await bar.getByRole('button',{name:'更多批量操作',exact:true}).click();await page.getByRole('menuitem',{name:'全选本页',exact:true}).click();await bar.getByRole('button',{name:'更多批量操作',exact:true}).click();await page.getByRole('menuitem',{name:'彻底删除',exact:true}).click();await confirm(page,false);assert(trash.every(n=>state.items.some(x=>x.filename===n)));await bar.getByRole('button',{name:'更多批量操作',exact:true}).click();await page.getByRole('menuitem',{name:'彻底删除',exact:true}).click();await confirm(page);await until(()=>trash.every(n=>!state.items.some(x=>x.filename===n)),'batch permanent');await page.getByText('回收站为空。',{exact:true}).waitFor();step('batch lifecycle',writes(state));
  });

  await scenario('single-trash-restore-and-permanent',1440,async({page,state,step})=>{
   await page.getByRole('button',{name:/^回收站/}).click();await until(()=>page.locator('.media-file').count().then(n=>n===2),'trash loaded');const first=state.items.find(x=>x.status==='trashed');await open(page);assert(await drawer(page).getByLabel('文件名',{exact:true}).evaluate(el=>el.readOnly));assert.equal(await drawer(page).getByRole('button',{name:'二次压缩',exact:true}).count(),0);await drawer(page).getByRole('button',{name:'恢复',exact:true}).click();await until(()=>first.status==='active','single restored');await until(()=>page.locator('.media-file').count().then(n=>n===1),'one trash remains');const last=state.items.find(x=>x.status==='trashed');await open(page);await drawer(page).getByRole('button',{name:'彻底删除',exact:true}).click();await confirm(page);await until(()=>!state.items.includes(last),'single permanent');step('single trash actions',writes(state));
  });

  await scenario('server-search-pagination-and-stale-request',1440,async({page,state,step})=>{
   state.items=Array.from({length:51},(_,i)=>makeItem(i+1));await page.getByRole('button',{name:'刷新媒体库',exact:true}).click();await until(()=>page.locator('.media-file').count().then(n=>n===50),'first server page');await page.getByRole('button',{name:'下一页',exact:true}).click();await until(()=>page.locator('.media-file').count().then(n=>n===1),'second server page');assert(state.requests.some(r=>r.query.page==='2'&&r.query.pageSize==='50'));
   const search=page.getByRole('textbox',{name:'搜索媒体文件'});const before=state.requests.length;await search.fill('媒体展示');await search.fill('媒体展示图 02');await page.waitForTimeout(150);assert.equal(state.requests.length,before,'search was not debounced');await until(()=>state.requests.some(r=>r.query.q==='媒体展示图 02'),'server q');await until(()=>page.locator('.media-file').count().then(n=>n===1),'filtered row');assert.match(await page.locator('.media-file-name').innerText(),/02/);assert.equal(state.requests.at(-1).query.page,'1');
   let release;const held={requested:false,promise:new Promise(resolve=>release=resolve),release:()=>release()};state.queryHolds.set('媒体展示图 01',held);await search.fill('媒体展示图 01');await until(()=>held.requested,'held old search');await search.fill('媒体展示图 03');await until(()=>state.requests.some(r=>r.query.q==='媒体展示图 03'),'new search');await until(()=>page.locator('.media-file-name').innerText().then(text=>text.includes('03')),'new search results');held.release();await until(()=>state.requests.find(r=>r.query.q==='媒体展示图 01').status===200,'old response delivered');await page.waitForTimeout(120);assert.match(await page.locator('.media-file-name').innerText(),/03/);assert.equal(writes(state).length,0);step('server q, page and stale response',state.requests);
  });

  assert.equal(distIndexSha256(),buildIndexSha256,'dist changed during browser run');const summary={passed:results.every(x=>x.passed),scenarios:results.length,screenshots:results.flatMap(x=>x.steps).filter(x=>x.screenshot).length,failed:results.filter(x=>!x.passed).map(x=>({name:x.name,error:x.error})),report:path.join(output,'report.json'),productionWrites:false};console.log(JSON.stringify(summary,null,2));if(!summary.passed)process.exitCode=1;
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
