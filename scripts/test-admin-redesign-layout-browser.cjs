const assert=require('node:assert/strict'),fs=require('node:fs'),{createFixture,launch,OUT,ID}=require('./fixtures/admin-redesign.cjs');
const {createHash}=require('node:crypto');const capturedAt=new Date().toISOString(),distHash=()=>createHash('sha256').update(fs.readFileSync('dist/index.html')).digest('hex'),buildIndexSha256=distHash();
const results=[],shots=[],errors=[];let completed=false;
const base=process.env.ADMIN_REDESIGN_URL||'http://127.0.0.1:5195';
function check(name,passed,details){results.push({name,passed,...(details?{details}: {})});assert.ok(passed,name+' '+JSON.stringify(details||''));}
async function snap(page,name){await page.screenshot({path:OUT+'/'+name+'.png',fullPage:false});shots.push(name+'.png');}
async function fits(page,name){const x=await page.evaluate(()=>{const m=document.querySelector('.admin-main');return {body:document.documentElement.scrollWidth,viewport:innerWidth,main:m?.clientWidth,scroll:m?.scrollWidth};});check(name,x.body<=x.viewport+1&&(!x.main||x.scroll<=x.main+1),x);}
async function writingGeometry(page,name,width){
 const geometry=await page.evaluate(()=>{
  const box=selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,center:r.y+r.height/2};};
  const bar=document.querySelector('.writing-topbar'),style=getComputedStyle(bar),panel=document.querySelector('.writing-settings');
  return {bar:box('.writing-topbar'),title:box('#article-title'),titleFont:parseFloat(getComputedStyle(document.querySelector('#article-title')).fontSize),meta:box('.writing-topbar-meta'),mode:box('.writing-mode-desktop'),actions:box('.writing-topbar-actions'),padding:[style.paddingTop,style.paddingRight,style.paddingBottom,style.paddingLeft],sizing:style.boxSizing,gap:parseFloat(style.columnGap),panel:panel?{topPadding:parseFloat(getComputedStyle(panel).paddingTop),heading:box('.writing-settings-heading h2'),button:box('.writing-settings-heading button')}:null};
 });
 if(width>=768){
  check(name+' desktop topbar72',Math.abs(geometry.bar.height-72)<1&&geometry.sizing==='border-box',geometry);
  check(name+' desktop padding and gaps',geometry.padding.join(' ')==='12px 28px 0px 28px'&&geometry.gap>=12,geometry);
  check(name+' title below topbar24',Math.abs(geometry.title.y-geometry.bar.bottom-24)<1,geometry);
  check(name+' desktop title38',geometry.titleFont===38,geometry);
  check(name+' topbar groups fit',geometry.meta.right<=geometry.mode.x+1&&geometry.mode.right<=geometry.actions.x+1&&geometry.actions.right<=geometry.bar.right-27,geometry);
  if(geometry.panel)check(name+' settings heading aligned',geometry.panel.topPadding===24&&Math.abs(geometry.panel.heading.center-geometry.actions.center)<1&&Math.abs(geometry.panel.button.center-geometry.actions.center)<1&&geometry.panel.button.height>=44,geometry);
 }
}
async function openSettings(page,width){if(width>=1280)return;if(width<768){await page.getByRole('button',{name:'更多文章操作',exact:true}).click();const targets=await page.getByRole('menuitem').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));check('phone menu targets44',targets.every(x=>x>=44),targets);await page.getByRole('menuitem',{name:'文章设置',exact:true}).click();}else await page.getByRole('button',{name:'文章设置',exact:true}).click();await page.getByRole('dialog',{name:'文章设置',exact:true}).waitFor();}
(async()=>{fs.mkdirSync(OUT,{recursive:true});const browser=await launch();try{
 for(const width of [1440,1024,768,767,390])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme,reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(t=>{try{localStorage.setItem('mooncci-theme',t);}catch{}},theme);const state=createFixture();await state.install(page);
  const prefix=`${width}-${theme}`;
  await page.goto(base+'/admin/write');await page.locator('#article-title').waitFor();await page.locator('.tiptap[contenteditable=true]').waitFor();await page.waitForFunction(t=>document.documentElement.classList.contains('dark')===(t==='dark'),theme);
  await snap(page,prefix+'-write-blank');await fits(page,prefix+' blank fits');await writingGeometry(page,prefix,width);
  if(width<768){const top=await page.locator('.writing-topbar').boundingBox(),mode=await page.locator('.writing-mode-mobile').boundingBox();check(prefix+' phone topbar56',Math.abs(top.height-56)<1,top);check(prefix+' mode below topbar',mode.y>=top.y+top.height,mode);check(prefix+' save hidden in bar',!(await page.locator('.writing-save-trigger').isVisible()));}
  await openSettings(page,width);await snap(page,prefix+'-settings-blank');await fits(page,prefix+' settings fits');
  const panel=width>=1280?page.locator('.writing-settings'):page.getByRole('dialog',{name:'文章设置',exact:true});
  check(prefix+' settings controls',await panel.locator('#article-category').isVisible());check(prefix+' no-cover actions absent',await panel.getByRole('button',{name:'调整取景',exact:true}).count()===0&&await panel.getByRole('button',{name:'移除',exact:true}).count()===0);
  const modes=await panel.locator('.writing-quality .writing-segment button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));check(prefix+' quality targets44',modes.every(x=>x>=44),modes);
  if(width<=900){const fonts=await panel.locator('input:not([type=file]),textarea').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().height).map(e=>parseFloat(getComputedStyle(e).fontSize)));check(prefix+' mobile inputs16',fonts.every(x=>x>=16),fonts);}
  if(width<1280){await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'文章设置',exact:true}).waitFor({state:'hidden'});check(prefix+' settings focus returns',await page.getByRole('button',{name:width<768?'更多文章操作':'文章设置',exact:true}).evaluate(e=>e===document.activeElement));}
  state.resetDraft({title:'写作与发布的实践记录',content:'<!--mooncci-richtext:v1--><h2>操作与思考</h2>'+Array.from({length:28},(_,i)=>`<p>第 ${i+1} 段：保留内容和交互，让每次编辑都清晰可靠。</p>`).join(''),summary:'记录写作与发布过程中的实践经验。',category:'开发记录',tags:['写作','体验'],cover_image:'/qa-cover.svg',cover_crop:{card:null,detail:{x:.4,y:.2,zoom:1.1}}});
  await page.goto(base+'/admin/write?draft='+ID);await page.getByRole('textbox',{name:'标题',exact:true}).waitFor();await page.locator('.tiptap[contenteditable=true]').waitFor();
  await openSettings(page,width);await snap(page,prefix+'-settings-cover');check(prefix+' framed cover present',await panel.locator('.writing-cover-preview .cover-image--framed').isVisible());
  if(width<1280)await page.keyboard.press('Escape');
  await page.locator('.admin-main').evaluate(e=>e.scrollTop=320);await snap(page,prefix+'-write-scrolled');
  const pinned=await page.locator('.writing-topbar').boundingBox(),imageTools=await page.locator('.writing-toolbar-image').boundingBox(),formatTools=await page.locator('.editor-toolbar-frame').boundingBox();
  check(prefix+' single toolbar below header',Math.abs(formatTools.y-pinned.y-pinned.height)<1&&Math.abs(formatTools.y-imageTools.y)<1&&formatTools.height===44,{pinned,imageTools,formatTools});
  if(width<768){const mode=await page.locator('.writing-mode-mobile').boundingBox();check(prefix+' only first bar sticks',pinned.y>=-1&&pinned.height===56&&mode.y+mode.height<56,{pinned,mode});}
  await fits(page,prefix+' scrolled fits');await page.locator('.admin-main').evaluate(e=>e.scrollTop=0);
  const group=page.getByRole('group',{name:'正文编辑模式',exact:true});await group.getByRole('button',{name:'阅读预览',exact:true}).click();await page.locator('.article-editor-preview').waitFor();await snap(page,prefix+'-reading-preview');await fits(page,prefix+' reading fits');
  for(const [route,title] of [['comments','评论管理'],['media','媒体库'],['users','用户管理'],['site-settings','站点设置']]){await page.goto(base+'/admin/'+route);await page.getByRole('heading',{name:title,exact:true}).waitFor();await page.waitForTimeout(100);await snap(page,prefix+'-'+route);await fits(page,prefix+' '+route+' fits');}
  await context.close();
 }
 check('no runtime errors',errors.length===0,errors);completed=true;console.log(JSON.stringify({passed:true,checks:results.length,screenshots:shots.length}));
}finally{fs.writeFileSync(OUT+'/browser-results.json',JSON.stringify({passed:completed&&results.every(x=>x.passed)&&!errors.length,capturedAt,buildIndexSha256,buildUnchanged:distHash()===buildIndexSha256,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',browser:browser.version(),results,errors,shots},null,2));await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
