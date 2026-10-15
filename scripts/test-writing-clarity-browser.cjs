// Local isolated Chrome acceptance for the strict e24 shared-style rollback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { createFixture, now } = require('./fixtures/admin-redesign.cjs');
const BASE = process.env.WRITING_CLARITY_URL || 'http://127.0.0.1:5195';
const origin = new URL(BASE);
assert(origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname), 'Local fixture preview only');
const phase = process.argv.includes('--baseline') ? 'baseline' : process.argv.includes('--after') ? 'after' : process.argv.includes('--compare') ? 'compare' : null;
assert(phase, 'Choose --baseline, --after or --compare');
const repeatComments = process.argv.includes('--repeat-comments');
const OUT = path.resolve('.cache/writing-clarity/round3', phase + (repeatComments ? '-controls' : ''));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const DIST = path.resolve(phase === 'baseline' ? '.cache/writing-clarity/baseline-source/dist' : 'dist');
const indexHash = () => hash(fs.readFileSync(path.join(DIST,'index.html')));
const post = { id:17, title:'清晰记录每一次构建与实践', summary:'从可读的界面开始，记录技术实践中的思考与经验。', content:'## 清晰的表达\n\n记录构建过程中的判断、取舍和验证，让每一次更新都容易理解。\n\n## 实践记录\n\n- 保持文字层级清楚\n- 让交互反馈及时可见\n- 保留键盘操作与移动阅读体验\n\n### 代码与验证\n\n```js\nconst readable = true;\n```\n\n持续修正细节，让内容在不同设备上保持一致。', category:'开发记录', tags:['实践','界面'], cover_image:'', cover_crop:null, slug:'clarity-fixture', author_name:'mooncci', published_at:now, updated_at:now, created_at:now, status:'published' };

function deterministicVisuals(dark) {
  try { localStorage.setItem('mooncci-theme',dark?'dark':'light');localStorage.setItem('mooncci-reading',JSON.stringify({reduceMotion:true})); } catch { /* Opaque initial documents have no storage. */ }
  // Grok Ball creates a random shape and renders once at performance.now even
  // with reduced motion. Freeze those inputs identically; do not hide the widget.
  Math.random=()=>0.5;
  Object.defineProperty(performance,'now',{configurable:true,value:()=>0});
}

async function install(page) {
  const state = createFixture();
  state.mediaItems=Array.from({length:20},(_,index)=>({filename:`fixture-${String(index+1).padStart(2,'0')}.webp`,display_name:`软件展示图 ${index+1}`,alt_text:`展示图 ${index+1}`,url:'/qa-cover.svg',size:20480,size_text:'20 KB',uploaded_at:now,updated_at:now,width:1600,height:900,status:'active',ext:'.webp'}));
  await state.install(page);
  const extraRequests = [];
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname;
    let data;
    if (p === '/api/admin/analytics') data = { start:'2026-09-16', end:'2026-10-15', startedAt:now, summary:{views:420,visitors:100,totalViews:5200,activeMembers:10}, users:{active:20,disabled:2,deleted:1}, trend:Array.from({length:30},(_,i)=>({day:'2026-09-'+String(i+1).padStart(2,'0'),views:20+i*3,visitors:10+i,registrations:i%3})),popular:[{path:'/article/17',views:42},{path:'/articles',views:30}],sources:[{label:'direct',views:100}],devices:[{label:'mobile',views:65},{label:'desktop',views:35}],roles:[{label:'user',count:20}],identities:[{label:'github',count:8}] };
    else if (p === '/api/auth/providers/manage') data = {providers:[{provider:'github',name:'GitHub',enabled:true,ready:true,client_id:'fixture-client-id',has_secret:true,version:1,source:'database',callback_url:'https://mooncci.site/api/auth/github/callback',origin:'https://mooncci.site'}]};
    else if (p === '/api/site-settings' || p === '/api/settings/site') data = {brand:{site_name:'mooncci'},hero:{eyebrow:'mooncci / 个人技术手记',title:'记录与分享',subtitle:'关于技术、构建过程与实践中的思考。',primary_text:'阅读文章',primary_link:'/articles'},footer:{copyright:'mooncci'},weather:{enabled:false},weather_companion:{enabled:false}};
    else if (p === '/api/posts') data = url.searchParams.get('format') === 'paged' ? {items:[post,{...post,id:18,title:'从一个小问题开始改进体验'}],total:2,page:1,pageSize:12} : [post,{...post,id:18,title:'从一个小问题开始改进体验'}];
    else if (p === '/api/posts/17') data = post;
    else if (p === '/api/posts/17/discovery') data = {previous:null,next:null,related:[]};
    else if (p === '/api/series/article/17') data = null;
    else if (p === '/api/comments/post/17') data = [];
    else if (p === '/api/analytics/article/17' || p === '/api/analytics/view') data = {views:128};
    else if (p === '/api/bookmarks/17') data = {bookmarked:false};
    else if (p === '/api/upload/media' && request.method()==='GET') data = {items:state.mediaItems,total:state.mediaItems.length,page:1,pageSize:50};
    else if (p === '/api/activity' || p === '/api/projects') data = {items:[],total:0,page:1,pageSize:6};
    else return route.fallback();
    extraRequests.push({method:request.method(),path:p});
    await route.fulfill({json:data});
  });
  return {state,extraRequests};
}

async function settle(page) {
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
  await page.waitForTimeout(800);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

const ordinary = [['analytics','/admin/analytics','访问统计'],['login-settings','/admin/login-settings','第三方登录'],['site-settings','/admin/site-settings','站点设置'],['comments','/admin/comments','评论管理'],['users','/admin/users','用户管理']];
const publicRoutes = [['home','/','记录与分享'],['articles','/articles','文章'],['article17','/article/17',post.title]];
const approved = [['media','/admin/media','媒体库'],['posts','/admin/posts','文章管理'],['write','/admin/write?draft=a1111111-1111-4111-8111-111111111111',null]];
const directory = path.resolve('.cache/writing-clarity/round3');
const sourceSnapshotFile = path.join(directory,'source-snapshot.json');
const paintProperties = ['color','backgroundColor','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','borderTopColor','borderTopWidth','borderTopStyle','borderRadius','boxShadow','opacity','transform','filter','backdropFilter','willChange'];

function verifySnapshot() {
  const snapshot=JSON.parse(fs.readFileSync(sourceSnapshotFile));
  assert.equal(indexHash(),snapshot.indexSha256,'Wait for the notified frozen build');
  for(const item of snapshot.files) {
    if(item.file==='scripts/test-writing-clarity-browser.cjs')continue; // Capture tool is intentionally still being prepared after product freeze.
    assert.equal(fs.existsSync(item.file)?hash(fs.readFileSync(item.file)):null,item.sha256,'Frozen source changed: '+item.file);
  }
  return snapshot;
}

async function inspect(page, diagnostic) {
  return page.evaluate(({paintProperties,diagnostic})=>{
    const rect=el=>el.getBoundingClientRect().toJSON();
    const identity=el=>({tag:el.tagName,className:typeof el.className==='string'?el.className:'',key:el.getAttribute('aria-label')||el.getAttribute('placeholder')||el.textContent?.trim().slice(0,90)||''});
    const visible=[...document.body.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';});
    const elements=visible.map(el=>({...identity(el),rect:rect(el),styles:Object.fromEntries(paintProperties.map(name=>[name,getComputedStyle(el)[name]]))}));
    const undefinedTokens=[],declaredTokens=new Set();
    const declared=rules=>{for(const rule of rules){if(rule.style)for(const property of rule.style)if(property.startsWith('--ui-'))declaredTokens.add(property);if(rule.cssRules)declared(rule.cssRules);}};
    for(const sheet of document.styleSheets)try{declared(sheet.cssRules);}catch{}
    if(diagnostic) {
      const visit=rules=>{for(const rule of rules){
        if(rule instanceof CSSMediaRule&&!matchMedia(rule.conditionText).matches)continue;
        if(rule instanceof CSSSupportsRule&&!CSS.supports(rule.conditionText))continue;
        if(rule.cssRules){visit(rule.cssRules);continue;}
        if(!rule.style||!rule.selectorText||!rule.cssText.includes('var(--ui-'))continue;
        const selectors=[rule.selectorText];
        for(const selector of selectors) {
          const pseudo=selector.match(/::(before|after)\b/),plain=selector.replace(/::(before|after)\b/g,'');
          let matched;try{matched=visible.filter(el=>el.matches(plain));}catch{continue;}
          for(const el of matched)for(const property of rule.style) {
            const value=rule.style.getPropertyValue(property),css=getComputedStyle(el,pseudo?'::'+pseudo[1]:null);
            for(const token of value.matchAll(/var\(\s*(--ui-[\w-]+)\s*([,)])/g))if(!css.getPropertyValue(token[1]).trim())undefinedTokens.push({...identity(el),selector,property,token:token[1],hasFallback:token[2]===',',value,rect:rect(el)});
          }
        }
      }};
      for(const sheet of document.styleSheets)try{visit(sheet.cssRules);}catch{/* Cross-origin sheets are already prohibited by the request guard. */}
    }
    const uiRoots=[...document.querySelectorAll('.ui-v2')].filter(el=>el.getBoundingClientRect().width>0).map(el=>{const css=getComputedStyle(el),tokens={};for(let i=0;i<css.length;i++)if(css[i].startsWith('--ui-'))tokens[css[i]]=css.getPropertyValue(css[i]).trim();return{...identity(el),tokens,background:css.backgroundColor,color:css.color};});
    const surfaces=diagnostic?['.admin-frame','.admin-main','.admin-content','.admin-media-page','.admin-posts-page','.writing-workspace','.media-toolbar','.media-batchbar','.writing-topbar'].flatMap(selector=>[...document.querySelectorAll(selector)].filter(el=>el.getBoundingClientRect().width>0).map(el=>{const css=getComputedStyle(el),rgba=css.backgroundColor.match(/[\d.]+/g)?.map(Number);return{selector,rect:rect(el),background:css.backgroundColor,color:css.color,neutral:!rgba||rgba.length===4&&rgba[3]===0||Math.max(...rgba.slice(0,3))-Math.min(...rgba.slice(0,3))<=1};})):[];
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const c=canvas.getContext('2d',{willReadFrequently:true});
    const rgba=value=>{c.clearRect(0,0,1,1);c.fillStyle=value;c.fillRect(0,0,1,1);return[...c.getImageData(0,0,1,1).data];};
    const over=(top,bottom)=>{const a=top[3]/255;return top.slice(0,3).map((v,i)=>v*a+bottom[i]*(1-a)).concat(255);};
    const luminance=rgb=>rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const paint=el=>{let chain=[],ancestor=el;while(ancestor){chain.unshift(ancestor);ancestor=ancestor.parentElement;}let background=[255,255,255,255];for(const node of chain)background=over(rgba(getComputedStyle(node).backgroundColor),background);const css=getComputedStyle(el),before=getComputedStyle(el,'::before'),pseudo=before.content!=='none'&&rgba(before.backgroundColor)[3]>0;if(pseudo)background=over(rgba(before.backgroundColor),background);const text=over(rgba(css.color),background),a=luminance(text),b=luminance(background);return{color:css.color,background:css.backgroundColor,before:{background:before.backgroundColor,content:before.content},hasButtonFill:pseudo||rgba(css.backgroundColor)[3]>0,paintedFace:background,faceSource:pseudo?'::before':'element/ancestors',contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),opacity:css.opacity,cursor:css.cursor,pointerEvents:css.pointerEvents};};
    const buttons=diagnostic?visible.filter(el=>el.matches('.ui-btn')).map(el=>{const normal=paint(el),wasDisabled=el.matches(':disabled'),attribute=el.getAttribute('disabled');let disabled=null;if(el.tagName==='BUTTON'){el.disabled=true;paint(el);for(const animation of el.getAnimations())if(Number.isFinite(animation.effect.getComputedTiming().endTime))animation.finish();disabled=paint(el);if(attribute===null)el.removeAttribute('disabled');else el.setAttribute('disabled',attribute);}return{...identity(el),rect:rect(el),normal,disabled,wasDisabled};}):[];
    const styleIssues=buttons.flatMap(button=>[...(button.className.includes('ui-btn--solid')&&!button.wasDisabled&&(!button.normal.hasButtonFill||button.normal.contrast<4.5)?[{element:button.key,reason:'Solid button has no visible fill or text contrast below 4.5:1.',contrast:button.normal.contrast,hasButtonFill:button.normal.hasButtonFill}]:[]),...(button.rect.height<44||button.rect.width<44?[{element:button.key,reason:'Button target is below 44px.',rect:button.rect}]:[]),...(button.disabled&&!button.wasDisabled&&button.disabled.opacity===button.normal.opacity&&button.disabled.color===button.normal.color&&button.disabled.background===button.normal.background&&button.disabled.before.background===button.normal.before.background?[{element:button.key,reason:'Disabled pseudo-class has no visible distinction.'}]:[])]);
    if(diagnostic&&(!buttons.length||!buttons.some(button=>button.className.includes('ui-btn--solid'))))styleIssues.push({reason:'No rendered ui-btn buttons or solid primary action; button checks must not be empty.'});
    const scopeLeaks=[document.documentElement,document.body,...visible].filter(el=>!el.closest('.ui-v2')).flatMap(el=>[...declaredTokens].filter(token=>getComputedStyle(el).getPropertyValue(token).trim()).map(token=>({...identity(el),token,value:getComputedStyle(el).getPropertyValue(token).trim()})));
    return{elements,undefinedTokens,uiRoots,surfaces,buttons,styleIssues,scopeLeaks,geometry:{dpr:devicePixelRatio,scale:visualViewport?.scale,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth,theme:document.documentElement.dataset.moonTheme}};
  },{paintProperties,diagnostic});
}

async function interactions(page,name,width,dark,fixtures) {
  const result={passed:true,inputs:[],mediaBatch:[],screenshots:[],issues:[],disabledProbe:'Native disabled pseudo-class was toggled and restored only to inspect CSS; this does not claim application busy-state coverage.'};
  const shot=async suffix=>{const filename=`media-${width}-${dark?'dark':'light'}-${suffix}.png`;await page.screenshot({path:path.join(OUT,filename),animations:'disabled'});result.screenshots.push(filename);};
  const check=(condition,message,evidence)=>{if(!condition)result.issues.push({message,evidence});};
  const inputProbe=async(scope=page)=>{
    const selector='input:not([type=checkbox],[type=file],[type=hidden],#article-title),textarea:not([aria-label="Markdown 正文"])';
    const fields=scope===page?page.locator('.ui-v2 input:not([type=checkbox],[type=file],[type=hidden],#article-title),.ui-v2 textarea:not([aria-label="Markdown 正文"])'):scope.locator(selector);
    for(let i=0;i<await fields.count();i++) {
      const field=fields.nth(i);if(!await field.isVisible())continue;
      await page.keyboard.press('Tab');await field.focus();
      const row=await field.evaluate(el=>{const css=getComputedStyle(el),r=el.getBoundingClientRect();let filled=el;while(filled&&getComputedStyle(filled).backgroundColor==='rgba(0, 0, 0, 0)')filled=filled.parentElement;return{label:el.getAttribute('aria-label')||el.id||el.placeholder,rect:r.toJSON(),borderWidths:[css.borderTopWidth,css.borderRightWidth,css.borderBottomWidth,css.borderLeftWidth],background:css.backgroundColor,paintedFill:filled?getComputedStyle(filled).backgroundColor:null,uiFill:css.getPropertyValue('--ui-fill').trim(),focusVisible:el.matches(':focus-visible'),outline:{width:css.outlineWidth,style:css.outlineStyle,color:css.outlineColor,offset:css.outlineOffset},boxShadow:css.boxShadow};});
      result.inputs.push(row);check(row.rect.height>=44,'Input height below 44px',row);check(row.borderWidths.every(v=>parseFloat(v)===0),'Input retains a border',row);check(row.focusVisible&&parseFloat(row.outline.width)>=2&&row.outline.style!=='none','Input has no visible keyboard focus outline',row);check(row.paintedFill&&!['rgb(255, 255, 255)','rgb(23, 23, 23)'].includes(row.paintedFill),'Input has no filled surface',row);
    }
  };
  try {
    if(name==='media') {
      await inputProbe();await page.locator('.media-detail-trigger').first().click();await page.locator('.media-detail-drawer').waitFor();await inputProbe(page.locator('.media-detail-drawer'));await page.keyboard.press('Escape');await page.locator('.media-detail-drawer').waitFor({state:'hidden'});
      if(width===390)await page.getByRole('button',{name:'选择',exact:true}).click();else await page.locator('.media-file-image').first().hover();
      await page.getByRole('checkbox').first().check();const bar=page.getByRole('region',{name:'批量媒体操作'});await bar.waitFor();
      const geometry=async(label)=>{
        const row=await bar.evaluate((el,label)=>{const css=getComputedStyle(el),r=el.getBoundingClientRect(),container=el.closest('.admin-media-page').getBoundingClientRect();return{label,position:css.position,rect:r.toJSON(),container:container.toJSON(),viewport:{width:innerWidth,height:innerHeight},buttons:[...el.querySelectorAll('button')].map(button=>{const rect=button.getBoundingClientRect();return{label:button.getAttribute('aria-label')||button.textContent,rect:rect.toJSON(),disabled:button.disabled,hits:[.1,.5,.9].map(fraction=>{const x=rect.left+rect.width*fraction,y=rect.top+rect.height/2,target=document.elementFromPoint(x,y);return{fraction,x,y,passed:target===button||button.contains(target),hit:target?.getAttribute('aria-label')||target?.tagName};})};})};},label);
        result.mediaBatch.push(row);check(row.position==='sticky','Media batch bar is not sticky',row);check(Math.abs(row.rect.left+row.rect.width/2-row.container.left-row.container.width/2)<=1,'Media batch bar is not centered in its content container',row);check(row.rect.top>=0&&row.rect.bottom<=row.viewport.height,'Media batch bar is outside viewport',row);check(Math.abs(row.viewport.height-row.rect.bottom-16)<=1,'Media batch bar is not 16px above the viewport bottom (emulated safe-area is zero)',row);check(row.rect.height>=56,'Media batch bar is below 56px height',row);
        if(width===390)check(Math.abs(row.rect.left-16)<=1&&Math.abs(row.viewport.width-row.rect.right-16)<=1,'Mobile batch bar is not inset 16px',row);
        for(const button of row.buttons){check(button.rect.width>=44&&button.rect.height>=44,'Batch target below 44px',button);check(button.disabled||button.hits.every(hit=>hit.passed),'Batch button is obstructed',button);}return row;
      };
      await geometry('selected1');await shot('selected1');
      await page.getByRole('checkbox').nth(1).check();await page.getByRole('checkbox').nth(2).check();await geometry('selected3');await shot('selected3');
      const scroll=await page.locator('.admin-media-page').evaluate(el=>{let host=el.parentElement;while(host&&!(host.scrollHeight>host.clientHeight&&/(auto|scroll)/.test(getComputedStyle(host).overflowY)))host=host.parentElement;host=host||document.scrollingElement;const before=host.scrollTop;host.scrollTop=host.scrollHeight;return{host:host.className||host.tagName,before,after:host.scrollTop,maximum:host.scrollHeight-host.clientHeight};});
      await page.waitForTimeout(150);check(scroll.after>scroll.before,'Media fixture did not exercise container scrolling',scroll);await geometry('scrolledToBottom');await shot('selected-scroll');
      const writes=()=>[...fixtures.state.requests,...fixtures.extraRequests].filter(request=>request.method!=='GET').length,before=writes();await bar.getByRole('button',{name:'删除到回收站',exact:true}).click();const confirm=page.getByRole('alertdialog');await confirm.waitFor();result.deleteConfirmation=await confirm.innerText();check(result.deleteConfirmation.includes('确定将选中的 3 个文件移入回收站？'),'Batch delete confirmation text changed',result.deleteConfirmation);await shot('delete-confirm');await confirm.getByRole('button',{name:'取消',exact:true}).click();await confirm.waitFor({state:'hidden'});check(writes()===before,'Cancelled confirmation sent a mutation',{before,after:writes()});await bar.getByRole('button',{name:'清空选择',exact:true}).click();await bar.waitFor({state:'hidden'});
    } else if(name==='posts') {
      await page.getByRole('button',{name:'从旧站导入',exact:true}).click();await page.getByRole('dialog').waitFor();await inputProbe();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
    } else {
      if(width===390){await page.getByRole('button',{name:'更多文章操作',exact:true}).click();await page.getByRole('menuitem',{name:'文章设置',exact:true}).click();await page.locator('.writing-settings-sheet').waitFor();}
      await inputProbe();if(width===390){await page.keyboard.press('Escape');await page.locator('.writing-settings-sheet').waitFor({state:'hidden'});}
    }
  }catch(error){result.issues.push({message:error.message});}
  check(result.inputs.length>=(name==='posts'?1:4),'Expected input coverage is missing',{page:name,count:result.inputs.length});result.passed=result.issues.length===0;return result;
}

async function captures(browser, results) {
  const cases=[];
  if(repeatComments)for(const dark of [false,true])for(const control of [1,2])cases.push({entry:ordinary.find(row=>row[0]==='comments'),width:1440,dark,control});
  else {
    for(const dark of [false,true])for(const entry of ordinary)cases.push({entry,width:1440,dark});
    for(const width of [1440,390])for(const dark of [false,true])for(const entry of publicRoutes)cases.push({entry,width,dark});
    if(phase==='after')for(const entry of approved)for(const [width,dark] of [[1440,false],[1440,true],[390,false]])cases.push({entry,width,dark,diagnostic:true});
  }
  for(const {entry:[name,route,title],width,dark,control,diagnostic=false} of cases) {
    const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1,hasTouch:width===390,isMobile:width===390,colorScheme:dark?'dark':'light',reducedMotion:'reduce',serviceWorkers:'block',locale:'zh-CN',timezoneId:'Asia/Hong_Kong'});
    const page=await context.newPage(),errors=[],external=[];page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&url.origin!==origin.origin){external.push(url.origin);return route.abort();}return route.continue();});
    await page.addInitScript(deterministicVisuals,dark);const fixtures=await install(page);
    if(name==='write')fixtures.state.resetDraft({title:'界面清晰度回归检查',content:'## 实践记录\n\n记录界面中的文字与操作反馈，保留现有写作功能。',summary:'用于本地界面验收的固定草稿。',category:'开发记录',tags:['实践','界面']});
    try {
      const response=await page.goto(BASE+route,{waitUntil:'domcontentloaded'});assert.equal(hash(await response.body()),indexHash(),'Preview entry differs from frozen dist');
      if(title)await page.getByRole('heading',{name:title,exact:true}).first().waitFor();
      if(name==='write'){await page.locator('#article-title').waitFor();await page.locator('.tiptap[contenteditable=true],textarea[aria-label="Markdown 正文"]').first().waitFor();assert.equal(await page.locator('#article-title').inputValue(),'界面清晰度回归检查');}
      if(name==='analytics')await page.getByRole('heading',{name:'访问趋势',exact:true}).waitFor();
      if(name==='posts')await page.getByText('Cities: Skylines II 都市天际线 2 进阶 Mod 推荐',{exact:true}).waitFor();
      if(name==='media')await page.locator('.media-file').first().waitFor();
      if(name==='login-settings')await page.getByRole('heading',{name:'GitHub',exact:true}).waitFor();
      await settle(page);await page.mouse.move(0,0);
      const audit=await inspect(page,diagnostic),filename=`${name}-${width}-${dark?'dark':'light'}${control?'-control'+control:''}.png`;
      await page.screenshot({path:path.join(OUT,filename),fullPage:true,animations:'disabled'});
      const interaction=diagnostic?await interactions(page,name,width,dark,fixtures):null;
      const checks={runtimeErrors:errors.length===0,noHorizontalOverflow:audit.geometry.scrollWidth<=width&&audit.geometry.bodyScrollWidth<=width,scale100:audit.geometry.dpr===1&&audit.geometry.scale===1,correctTheme:audit.geometry.theme===(dark?'dark':'light'),definedUiTokens:audit.undefinedTokens.length===0,neutralPageSurfaces:audit.surfaces.every(row=>row.neutral),retainedButtonStyles:audit.styleIssues.length===0,noUiScopeLeaks:audit.scopeLeaks.length===0,interactions:!interaction||interaction.passed};
      const row={name,route,width,dark,control,diagnostic,filename,...audit,interaction,checks,pngSha256:hash(fs.readFileSync(path.join(OUT,filename))),runtimeErrors:errors,externalOriginsBlocked:[...new Set(external)],mockedRequests:[...fixtures.state.requests,...fixtures.extraRequests].map(r=>({method:r.method,path:r.path})),passed:Object.values(checks).every(Boolean)};
      results.push(row);console.log((row.passed?'PASS ':'CHECK FAILED ')+filename+' '+JSON.stringify(checks));
    } catch(error){console.error(JSON.stringify({name,route,runtimeErrors:errors,body:(await page.locator('body').innerText()).slice(0,2000)}));throw error;}
    finally{await context.close();}
  }
}

async function compare() {
  const read=folder=>JSON.parse(fs.readFileSync(path.join(directory,folder,'report.json'))),baseline=read('baseline'),after=read('after'),controls=read('baseline-controls'),snapshot=verifySnapshot();
  assert(baseline.captureComplete&&after.captureComplete&&controls.captureComplete);assert.equal(baseline.baselineRevision,'e24bf9b722ff2db0c29c430f96f886c212702d19');assert.equal(after.buildIndexSha256,snapshot.indexSha256);assert.equal(baseline.browserMetadata.product,after.browserMetadata.product);assert.equal(controls.buildIndexSha256,baseline.buildIndexSha256);
  const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage(),results=[],repeatControls=[],baselineRepeatPairs=[];let pixelSelfcheck;
  const pixelsFor=async(firstFolder,firstName,secondFolder,secondName)=>page.evaluate(async({a,b})=>{
    const load=source=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=source;});const [first,second]=await Promise.all([load(a),load(b)]);
    if(first.width!==second.width||first.height!==second.height)return{equal:false,changedPixels:null,baseline:{width:first.width,height:first.height},after:{width:second.width,height:second.height},reason:'image dimensions differ'};
    const canvas=document.createElement('canvas');canvas.width=first.width;canvas.height=first.height;const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(first,0,0);const x=c.getImageData(0,0,canvas.width,canvas.height).data;c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(second,0,0);const y=c.getImageData(0,0,canvas.width,canvas.height).data;
    let changedPixels=0,left=canvas.width,top=canvas.height,right=-1,bottom=-1;const samples=[],bands={};
    for(let i=0;i<x.length;i+=4)if(x[i]!==y[i]||x[i+1]!==y[i+1]||x[i+2]!==y[i+2]||x[i+3]!==y[i+3]){changedPixels++;const px=(i/4)%canvas.width,py=Math.floor(i/4/canvas.width);left=Math.min(left,px);top=Math.min(top,py);right=Math.max(right,px);bottom=Math.max(bottom,py);const band=Math.floor(py/40)*40;bands[band]=(bands[band]||0)+1;if(samples.length<100)samples.push({x:px,y:py,baseline:[...x.slice(i,i+4)],after:[...y.slice(i,i+4)]});}
    return{equal:changedPixels===0,changedPixels,width:canvas.width,height:canvas.height,bounds:changedPixels?{left,top,right,bottom}:null,samples,bands,comparison:'Every RGBA pixel from x=0; no masks or tolerance'};
  },{a:'data:image/png;base64,'+fs.readFileSync(path.join(directory,firstFolder,firstName)).toString('base64'),b:'data:image/png;base64,'+fs.readFileSync(path.join(directory,secondFolder,secondName)).toString('base64')});
  const locate=(row,sample)=>row.elements.filter(el=>sample.x>=el.rect.left&&sample.x<el.rect.right&&sample.y>=el.rect.top&&sample.y<el.rect.bottom).sort((a,b)=>a.rect.width*a.rect.height-b.rect.width*b.rect.height).slice(0,5);
  try {
    const probes=await page.evaluate(()=>[140,141].map(blue=>{const canvas=document.createElement('canvas');canvas.width=2;canvas.height=1;const context=canvas.getContext('2d'),pixels=new ImageData(new Uint8ClampedArray([100,120,blue,255,255,255,255,255]),2,1);context.putImageData(pixels,0,0);return canvas.toDataURL().split(',')[1];}));
    for(let i=0;i<probes.length;i++)fs.writeFileSync(path.join(directory,'pixel-selfcheck-'+i+'.png'),Buffer.from(probes[i],'base64'));
    pixelSelfcheck=await pixelsFor('.','pixel-selfcheck-0.png','.','pixel-selfcheck-1.png');assert.equal(pixelSelfcheck.equal,false);assert.equal(pixelSelfcheck.changedPixels,1);assert.deepEqual(pixelSelfcheck.bounds,{left:0,top:0,right:0,bottom:0});assert.deepEqual(pixelSelfcheck.samples[0],{x:0,y:0,baseline:[100,120,140,255],after:[100,120,141,255]});
    for(const row of after.results.filter(row=>!row.diagnostic)) {
      const old=baseline.results.find(item=>item.filename===row.filename);assert(old,'Missing baseline '+row.filename);const pixels=await pixelsFor('baseline',old.filename,'after',row.filename);
      const differences=[];if(row.route.startsWith('/admin')){if(old.elements.length!==row.elements.length)differences.push({reason:'visible element count',baseline:old.elements.length,after:row.elements.length});for(let i=0;i<Math.min(old.elements.length,row.elements.length);i++){const a=old.elements[i],b=row.elements[i];if(a.tag!==b.tag||a.key!==b.key){differences.push({index:i,reason:'identity',baseline:{tag:a.tag,key:a.key},after:{tag:b.tag,key:b.key}});continue;}for(const property of paintProperties)if(a.styles[property]!==b.styles[property])differences.push({index:i,tag:a.tag,key:a.key,property,baseline:a.styles[property],after:b.styles[property]});if(JSON.stringify(a.rect)!==JSON.stringify(b.rect))differences.push({index:i,tag:a.tag,key:a.key,property:'rect',baseline:a.rect,after:b.rect});}}
      results.push({name:row.name,filename:row.filename,route:row.route,passed:pixels.equal&&row.passed&&old.passed,pixels,differences,pixelElements:pixels.samples?.slice(0,20).map(sample=>({sample,baseline:locate(old,sample),after:locate(row,sample)}))});
    }
    for(const row of controls.results){const old=baseline.results.find(item=>item.name==='comments'&&item.dark===row.dark);repeatControls.push({filename:row.filename,pixels:await pixelsFor('baseline',old.filename,'baseline-controls',row.filename)});}
    for(const dark of [false,true]){const first=controls.results.find(row=>row.dark===dark&&row.control===1),second=controls.results.find(row=>row.dark===dark&&row.control===2);assert(first&&second);baselineRepeatPairs.push({theme:dark?'dark':'light',first:first.filename,second:second.filename,pixels:await pixelsFor('baseline-controls',first.filename,'baseline-controls',second.filename)});}
  }finally{await browser.close();}
  const diagnostics=after.results.filter(row=>row.diagnostic),summary={adminExact:results.filter(r=>r.route.startsWith('/admin')&&r.pixels.equal).length,adminTotal:10,frontendExact:results.filter(r=>!r.route.startsWith('/admin')&&r.pixels.equal).length,frontendTotal:12,repeatControlsExact:repeatControls.filter(r=>r.pixels.equal).length,repeatControlsTotal:4,approvedDiagnosticsPassed:diagnostics.filter(r=>r.passed).length,approvedDiagnosticsTotal:9};
  const descriptions={
    'src/app/components/admin/AdminShell.tsx':'与e24逐字节一致，恢复原后台外壳。',
    'src/styles/theme.css':'与e24逐字节一致，撤回共享主题变量。',
    'src/styles/admin-media.css':'局部按钮引用新变量，批量条改为内容容器内sticky并居中。',
    'src/styles/admin-posts.css':'仅文章列表页的必要按钮或字段样式。',
    'src/styles/admin-writing.css':'仅写作页按钮局部变量兼容，不执行B修改。',
    'src/styles/admin-shell.css':'基线不存在，已删除新增共享外壳样式。',
    'test/admin-shell.test.cjs':'基线不存在，已删除对应新增外壳测试。',
    'src/styles/admin-ui-v2.css':'三页专用中性变量及44px按钮、字段、弹层的限定样式。',
    'src/app/pages/AdminMediaPage.tsx':'显式媒体页作用域及批量条所需局部容器。',
    'src/app/pages/AdminPostsPage.tsx':'显式文章列表页与弹层的专用变量作用域。',
    'src/app/pages/AdminWritePage.tsx':'显式写作页及其弹层专用变量作用域，不实施B。',
    'src/app/components/admin/ArticleImageMenu.tsx':'写作图片菜单与弹层显式继承专用变量。',
    'src/components/tiptap-templates/simple/simple-editor.tsx':'写作工具栏弹层显式继承专用变量。',
    'scripts/test-writing-clarity-browser.cjs':'本地固定数据、完整RGBA零容差截图与诊断证据。',
    'test/admin-palette-scope.test.cjs':'限定共享区不变并验证三页按钮、输入与中性变量作用域。',
    'test/admin-media-page.test.cjs':'更新媒体局部按钮标记的原有回归断言，不改API。'
  };
  const outside=new Set(['src/app/components/admin/AdminShell.tsx','src/styles/theme.css','src/styles/admin-shell.css','test/admin-shell.test.cjs']);
  const files=snapshot.files.map(item=>({...item,scope:outside.has(item.file)?'范围外：按要求回退':item.file.startsWith('scripts/')||item.file.startsWith('test/')?'仅验证':'三页内',description:descriptions[item.file]||'见真实差异。'}));
  const previousSnapshot=JSON.parse(fs.readFileSync('.cache/writing-clarity/round2/source-snapshot.json'));
  const round3ChangedFiles=files.filter(item=>!previousSnapshot.files.some(previous=>previous.file===item.file&&previous.sha256===item.sha256));
  const restorationPass=results.length===22&&results.every(r=>r.passed)&&repeatControls.length===4&&repeatControls.every(r=>r.pixels.equal)&&baselineRepeatPairs.length===2&&baselineRepeatPairs.every(r=>r.pixels.equal),threePageStyleComplete=diagnostics.length===9&&diagnostics.every(r=>r.passed);
  const historicalDifference={element:'评论状态“待审核”徽标',selector:'.admin-content span.bg-yellow-50',rect:{x:295.5,y:490,width:60,height:24},phase1:'亮暗各12个圆角边缘像素，RGBA(254,252,233,255) → (254,252,232,255)，蓝通道差1；该轮失败证据仍保留。',round2:'四项共享源完整还原后，此处及整张评论页均重新执行零容差比较。未把旧差异认定为噪声，未归因于未经证实的单条CSS。'};
  const report={passed:restorationPass&&threePageStyleComplete,restorationPass,threePageStyleComplete,baselineRevision:baseline.baselineRevision,baselineIndexSha256:baseline.buildIndexSha256,afterIndexSha256:after.buildIndexSha256,summary,baselineProvenance:{file:'baseline-provenance.json',sha256:hash(fs.readFileSync(path.join(directory,'baseline-provenance.json')))},round3ChangedFiles,files,results,repeatControls,baselineRepeatPairs,diagnostics,pixelSelfcheck,historicalDifference,productionConnections:false,pixelPolicy:'Full screenshots; all RGBA channels at every pixel; no masks and no tolerance; nonzero differences fail.'};
  fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(report,null,2)+'\n');
  const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const filesHtml=items=>'<ul>'+items.map(f=>'<li>【'+escape(f.scope)+'】<code>'+escape(f.file)+'</code>：'+escape(f.description)+'</li>').join('')+'</ul>';
  const pairs=results.map(row=>'<section><h2>'+escape(row.filename)+' — '+(row.passed?'PASS':'FAIL')+'</h2><p>全图变化像素：'+row.pixels.changedPixels+'；范围：'+escape(JSON.stringify(row.pixels.bounds))+'；DOM样式/矩形差异：'+row.differences.length+'。</p><article><figure><figcaption>e24基线</figcaption><img src="baseline/'+row.filename+'"></figure><figure><figcaption>本轮严格撤回后</figcaption><img src="after/'+row.filename+'"></figure></article>'+(row.passed?'':'<details><summary>差异元素与原始RGBA证据</summary><pre>'+escape(JSON.stringify({differences:row.differences,pixelElements:row.pixelElements},null,2))+'</pre></details>')+'</section>').join('');
  const html='<!doctype html><meta charset="utf-8"><title>第三轮三页样式修补验收</title><style>body{font:15px system-ui;margin:24px;background:#eee;color:#171717}section{margin:32px 0}article{display:flex;gap:16px;overflow:auto}figure{margin:0;flex:0 0 48%}img{width:100%;height:auto;border:1px solid #ccc}pre{white-space:pre-wrap;overflow-wrap:anywhere}code{overflow-wrap:anywhere}</style><h1>第三轮：三页样式修补与共享区零变化</h1><p>e24基线与最新冻结构建。完整截图包括侧栏，RGBA逐像素比较，无蒙版、阈值或隐藏元素。固定本地API数据、Chrome100%/DPR1；小球随机输入与首次时间固定且可见。前两轮证据完整保留。本轮沿用第二轮冻结的e24基线及独立评论重复控制，按字节复制并核对SHA；after均由新构建重拍。</p><pre>'+escape(JSON.stringify({passed:report.passed,restorationPass,threePageStyleComplete,...summary},null,2))+'</pre><h2>本轮修补（'+round3ChangedFiles.length+'文件）</h2>'+filesHtml(round3ChangedFiles)+'<details><summary>累计'+files.length+'文件（含上一轮已完成的共享回退）</summary>'+filesHtml(files)+'</details>'+pairs+'<h2>原评论徽标差异</h2><pre>'+escape(JSON.stringify(historicalDifference,null,2))+'</pre><h2>评论基线两轮独立context重拍</h2><pre>'+escape(JSON.stringify({canonicalVsControls:repeatControls,control1VsControl2:baselineRepeatPairs},null,2))+'</pre><h2>三页保留改版诊断（不与e24伪称相同）</h2><p>写作页固定既有草稿按原有默认进入Markdown源码模式，未为截图切换模式。未修改产品来掩盖共享按钮或布局样式缺失。</p>'+diagnostics.map(row=>'<section><h3>'+row.filename+' — '+(row.passed?'检查通过':'发现样式缺项')+'</h3><img style="max-width:100%" src="after/'+row.filename+'"><pre>'+escape(JSON.stringify({checks:row.checks,styleIssues:row.styleIssues,undefinedTokens:row.undefinedTokens,scopeLeaks:row.scopeLeaks,interaction:row.interaction,surfaces:row.surfaces,buttons:row.buttons},null,2))+'</pre>'+(row.interaction?.screenshots||[]).map(filename=>'<details><summary>'+escape(filename)+'</summary><img style="max-width:100%" src="after/'+escape(filename)+'"></details>').join('')+'</section>').join('');
  fs.writeFileSync(path.join(directory,'comparison.html'),html+'\n');console.log(JSON.stringify({passed:report.passed,summary,failed:results.filter(r=>!r.passed).map(r=>({filename:r.filename,pixels:r.pixels})),diagnosticFailures:diagnostics.filter(r=>!r.passed).map(r=>({filename:r.filename,checks:r.checks})),report:path.join(directory,'comparison.json')}));if(!report.passed)process.exitCode=1;
}

(async()=>{
  if(phase==='compare')return compare();
  assert(['baseline','after'].includes(phase),'Round3 supports baseline/after/compare only');
  const initial=indexHash();if(phase==='after')verifySnapshot();else assert.equal(JSON.parse(fs.readFileSync('.cache/writing-clarity/baseline-source.json')).revision,'e24bf9b722ff2db0c29c430f96f886c212702d19');
  fs.mkdirSync(OUT,{recursive:true});assert(!fs.existsSync(path.join(OUT,'report.json')),'Preserve existing evidence; refuse overwrite');
  const results=[],browser=await chromium.launch({channel:'chrome',headless:true});let browserMetadata,captureComplete=false;
  try{const cdp=await browser.newBrowserCDPSession();browserMetadata=await cdp.send('Browser.getVersion');const command=await cdp.send('Browser.getBrowserCommandLine');browserMetadata.executable=command.arguments[0];assert(browserMetadata.executable.replaceAll('\\','/').toLowerCase().endsWith('/google/chrome/application/chrome.exe'));await captures(browser,results);assert.equal(indexHash(),initial,'Build changed during capture');captureComplete=true;}
  finally{await browser.close();const report={phase,repeatComments,baselineRevision:phase==='baseline'?'e24bf9b722ff2db0c29c430f96f886c212702d19':null,passed:captureComplete&&results.every(r=>r.passed),captureComplete,capturedAt:new Date().toISOString(),buildIndexSha256:initial,buildUnchanged:indexHash()===initial,browserMetadata,results,mode:'Local isolated fixtures; external HTTP blocked; full screenshot exact RGBA; no masks/tolerance',limitations:['390px is Chrome touch emulation, not a physical phone.','Fixed API data is not production data.','Widget random input 0.5 and initial performance timestamp 0; no hidden elements.']};fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,captureComplete,screenshots:results.length,report:path.join(OUT,'report.json')}));}
})().catch(error=>{console.error(error);process.exitCode=1;});
