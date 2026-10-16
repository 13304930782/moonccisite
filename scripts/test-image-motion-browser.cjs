// Real article route; all HTTP/data is isolated to a disposable browser context.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const origin=process.env.INTERACTION_ORIGIN||'http://127.0.0.1:5251',baseline=process.env.IMAGE_BASELINE==='1';
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin),'Only loopback acceptance is allowed');
process.env.INTERACTION_ORIGIN=origin;
const {install}=require('./test-round2-public-browser.cjs');
const output=path.resolve(process.env.INTERACTION_EVIDENCE||'.cache/motion-design/images/candidate');fs.mkdirSync(output,{recursive:true});
const engine=process.env.IMAGE_ENGINE||'chrome',fixtureFormat=process.env.IMAGE_FIXTURE||'svg',report={origin,baseline,engine,fixtureFormat,cases:[],pageerrors:[]};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const svg=(width,height)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1200 800"><defs><pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="#ffffff" stroke-opacity=".25" stroke-width="2"/></pattern></defs><rect width="1200" height="800" fill="#387a70"/><rect width="1200" height="800" fill="url(#grid)"/><circle cx="600" cy="400" r="180" fill="#f1cf79"/><path d="M200 400H1000M600 100V700" stroke="#19453e" stroke-width="10"/><text x="600" y="450" fill="#19453e" font-family="sans-serif" font-size="80" text-anchor="middle">MOONCCI</text></svg>`;
// SVG is the default regression fixture, including its WebKit intrinsic-size
// path. PNG remains an additional format matrix, never a replacement SVG gate.
async function rasterFixtures(page){
 const values=await page.evaluate(()=>[[2000,1400],[800,1800],[1200,1200],[2000,800]].map(([width,height])=>{
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#387a70';ctx.fillRect(0,0,width,height);
  ctx.strokeStyle='rgba(255,255,255,.25)';ctx.lineWidth=2;
  for(let x=0;x<width;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}
  for(let y=0;y<height;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
  ctx.fillStyle='#f1cf79';ctx.beginPath();ctx.arc(width/2,height/2,Math.min(width,height)*.2,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#19453e';ctx.font='80px sans-serif';ctx.textAlign='center';ctx.fillText('MOONCCI',width/2,height/2+28);
  return [width+'x'+height,canvas.toDataURL('image/png').split(',')[1]];
 }));
 return new Map(values.map(([key,value])=>[key,Buffer.from(value,'base64')]));
}
(async()=>{let browser;try{
 browser=await(engine==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:'chrome',headless:true}));
 for(const options of [{width:1440,reduced:false},{width:390,reduced:false},{width:390,reduced:true}]){
  const dir=path.join(output,`${options.width}-${options.reduced?'reduced':'normal'}`);fs.mkdirSync(dir,{recursive:true});
  const context=await browser.newContext({viewport:{width:options.width,height:options.width===390?844:900},hasTouch:options.width===390,reducedMotion:options.reduced?'reduce':'no-preference',recordVideo:{dir,size:{width:options.width,height:options.width===390?844:900}}});
  await context.addInitScript(()=>{try{localStorage.setItem('mooncci-theme','light');}catch{}});
  await install(context);let shape=[2000,1400];
  const recordingStart=Date.now(),page=await context.newPage(),row={...options,checks:[]};report.cases.push(row);page.on('pageerror',error=>report.pageerrors.push(error.message));
  const rasters=fixtureFormat==='png'?await rasterFixtures(page):null;
  await context.route('**/round2-images/*',route=>route.fulfill({contentType:rasters?'image/png':'image/svg+xml',body:rasters?rasters.get(shape.join('x')):svg(...shape),headers:{'Cache-Control':'no-store'}}));
  const check=(name,passed,details)=>{row.checks.push({name,passed,details});if(!baseline)assert.equal(passed,true,name);};
  const stage=()=>page.locator('.article-image-stage');const image=()=>page.locator('.markdown-body img[data-preview-image]').first();
  const open=async()=>{await image().scrollIntoViewIfNeeded();await page.waitForTimeout(150);await image().click();await stage().waitFor();await page.waitForFunction(()=>document.querySelector('.article-image-stage')?.getAttribute('aria-busy')==='false');};
  try{
   await page.goto(origin+'/article/1');await image().waitFor();await page.evaluate(()=>document.fonts.ready);await image().scrollIntoViewIfNeeded();await sleep(200);
   const reading=await page.evaluate(()=>scrollY);row.firstActionSeconds=(Date.now()-recordingStart)/1000;await open();
   await page.waitForTimeout(80);
   const opening=await page.evaluate(()=>({clones:document.querySelectorAll('[data-motion-presentation=image]').length,real:document.querySelector('.article-image-stage img')?.getBoundingClientRect().toJSON(),visibility:getComputedStyle(document.querySelector('.article-image-stage img')).visibility,stage:document.querySelector('.article-image-stage')?.getBoundingClientRect().toJSON()}));
   await page.screenshot({path:path.join(dir,'open-80ms.png')});
   check('open uses an independent image presentation, not geometry in scroll viewport',options.reduced||opening.clones===1,opening);
   check('the real image remains available to accessibility while its presentation moves',opening.visibility==='visible');
   await page.waitForTimeout(350);await page.screenshot({path:path.join(dir,'open-rest.png')});
   const box=await stage().boundingBox();
   await page.mouse.dblclick(box.x+box.width*.58,box.y+box.height*.55);await page.waitForTimeout(280);
   const scaled=await stage().evaluate(el=>({scale:Number(el.dataset.scale)||1,x:Number(el.dataset.panX)||0,y:Number(el.dataset.panY)||0}));
   check('pointer zoom has an inspected anchor rather than a top-left layout jump',scaled.scale>1.1&&scaled.x<0&&scaled.y<0,scaled);
   if(baseline){await page.getByRole('button',{name:'查看原始尺寸',exact:true}).click();await stage().evaluate(el=>{el.scrollLeft=500;el.scrollTop=400;});} // Baseline recovery: double-click had no zoom action.
   const x=box.x+box.width*.5,y=box.y+box.height*.5;
   const pan=()=>stage().evaluate(el=>({x:el.dataset.panX===undefined?-el.scrollLeft:Number(el.dataset.panX),y:el.dataset.panY===undefined?-el.scrollTop:Number(el.dataset.panY)}));
   await page.mouse.move(x,y);await page.mouse.down();const before=await pan();
   await page.mouse.move(x+45,y+30,{steps:6});
   const during=await pan();
   check('drag follows pointer 1:1 before release',Math.abs(during.x-before.x-45)<1&&Math.abs(during.y-before.y-30)<1,{before,during});
   await page.mouse.up();await page.waitForTimeout(250);
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+1500,y+1100,{steps:12});const resisted=await pan();
   await page.mouse.up();await page.waitForTimeout(650);const settled=await pan();
   check('out-of-bounds drag has resistance and settles to its image boundary',settled.x<resisted.x&&settled.y<resisted.y,{resisted,settled});
   await page.getByRole('button',{name:'适应窗口',exact:true}).click();await page.waitForTimeout(100);await page.getByRole('button',{name:'查看原始尺寸',exact:true}).click();await page.waitForTimeout(100);await page.getByRole('button',{name:'适应窗口',exact:true}).click();await page.waitForTimeout(260);
   check('rapid zoom reversal follows the last state',await stage().evaluate(el=>Math.abs((Number(el.dataset.scale)||1)-1)<.01));
   await page.keyboard.press('ArrowRight');await page.waitForTimeout(110);await page.keyboard.press('ArrowLeft');await page.waitForTimeout(360);
   check('rapid gallery reversal keeps the latest image and removes obsolete clones',(await page.locator('.article-image-navigation [role=status]').innerText())==='1 / 3'&&await page.locator('[data-motion-presentation=image]').count()===0);
   await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});await page.waitForTimeout(230);
   check('close restores focus and the exact reading position',await image().evaluate(el=>el===document.activeElement)&&Math.abs(await page.evaluate(()=>scrollY)-reading)<2);
   for(let i=0;i<3;i++){await image().evaluate(el=>el.click());await page.waitForTimeout(65);await page.keyboard.press('Escape');await page.waitForTimeout(45);}await page.waitForTimeout(250);
   check('rapid open/close leaves no overlay, presentation or input lock',await page.evaluate(()=>!document.querySelector('[data-motion-presentation=image]')&&!document.querySelector('[role=dialog]')&&document.body.style.pointerEvents!=='none'));
   if(!baseline&&!options.reduced){
    await open();await page.waitForTimeout(45);
    await page.evaluate(()=>{const read=()=>{const node=document.querySelector('[data-motion-presentation=image]');if(!node)return null;const rect=node.getBoundingClientRect(),style=getComputedStyle(node);return {...rect.toJSON(),opacity:Number(style.opacity),radius:parseFloat(style.borderRadius)*rect.width/parseFloat(node.style.width),clip:style.clipPath};};document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const before=read();queueMicrotask(()=>{window.__imageReverse={before,after:read()};});},{once:true,capture:true});});
    await page.keyboard.press('Escape');const reverse=await page.evaluate(()=>window.__imageReverse);
    check('closing during the opening flight continues from its current rectangle',reverse?.before&&reverse?.after&&['x','y','width','height'].every(key=>Math.abs(reverse.before[key]-reverse.after[key])<2),reverse);
    check('reversal also preserves current radius, opacity and clipping',reverse?.before&&reverse?.after&&Math.abs(reverse.before.radius-reverse.after.radius)<.5&&Math.abs(reverse.before.opacity-reverse.after.opacity)<.02&&reverse.before.clip===reverse.after.clip,reverse);
    await page.waitForTimeout(250);
    await image().evaluate(el=>el.style.width='120px');await open();await page.waitForTimeout(340);
    await page.evaluate(()=>{const nativeCancel=Animation.prototype.cancel,nativeAnimate=Element.prototype.animate,seenCancel=new WeakSet(),seenStart=new WeakSet();let cancelled=null;window.__reopenTrace=[];Animation.prototype.cancel=function(){const node=this.effect?.target;if(node?.dataset.motionPresentation==='image'&&node.isConnected&&!seenCancel.has(node)){seenCancel.add(node);cancelled=node.getBoundingClientRect().toJSON();}return nativeCancel.call(this);};Element.prototype.animate=function(...args){const animation=nativeAnimate.apply(this,args);if(this.dataset.motionPresentation==='image'&&!seenStart.has(this)){seenStart.add(this);const from=cancelled;queueMicrotask(()=>{if(this.isConnected)window.__reopenTrace.push({from,rectangle:this.getBoundingClientRect().toJSON()});});}return animation;};window.__restoreImageObservation=()=>{Animation.prototype.cancel=nativeCancel;Element.prototype.animate=nativeAnimate;};});
    const sourceBox=await image().boundingBox(),sourceWidth=sourceBox.width;
    // Locator actionability can wait for the exit to settle in WebKit. Send a
    // real pointer click at the known source position while it is still moving.
    await page.keyboard.press('Escape');await page.waitForTimeout(60);await page.mouse.click(sourceBox.x+sourceBox.width/2,sourceBox.y+sourceBox.height/2);await stage().waitFor();await page.waitForFunction(()=>document.querySelector('.article-image-stage')?.getAttribute('aria-busy')==='false');
    const reopen=await page.evaluate(()=>{window.__restoreImageObservation();return window.__reopenTrace.at(-1);});
    check('a small thumbnail can reopen from the interrupted exit instead of restarting at the source',reopen?.from&&reopen.from.width>sourceWidth+2&&['x','y','width','height'].every(key=>Math.abs(reopen.from[key]-reopen.rectangle[key])<2),{...reopen,sourceWidth});
    await page.waitForTimeout(340);await page.keyboard.press('Escape');await page.waitForTimeout(250);
    await open();await page.waitForTimeout(340);await page.getByRole('button',{name:'查看原始尺寸',exact:true}).click();await page.waitForTimeout(280);await image().evaluate(el=>el.style.display='none');await page.keyboard.press('Escape');
    const fallback=await page.locator('[data-motion-presentation=image]').evaluate(el=>el.getAnimations().map(animation=>animation.effect.getKeyframes().map(({opacity,transform,clipPath})=>({opacity,transform,clipPath}))));
    check('an unavailable source uses a local fade instead of a stale return flight',fallback.some(track=>track.at(-1)?.opacity==='0')&&fallback.flat().filter(frame=>frame.transform).every(frame=>frame.transform==='translateX(0px)'),fallback);await page.waitForTimeout(250);
    check('a zoomed fallback retains its viewport clipping instead of exposing the full oversized image',fallback.some(track=>track.some(frame=>frame.clipPath&&(frame.clipPath.match(/[\d.]+/g)||[]).some(value=>Number(value)>0))),fallback);
   }
   for(const [name,dimensions]of [['portrait',[800,1800]],['square',[1200,1200]],['landscape',[2000,800]]]){
    shape=dimensions;await page.goto(origin+'/article/1?shape='+name);await open();
    const samples=await page.evaluate(async()=>{const result=[];for(let i=0;i<12;i++){const stage=document.querySelector('.article-image-stage'),img=stage.querySelector('img'),r=img.getBoundingClientRect();result.push({x:r.x,y:r.y,w:r.width,h:r.height,overflowX:stage.scrollWidth-stage.clientWidth,overflowY:stage.scrollHeight-stage.clientHeight});await new Promise(resolve=>requestAnimationFrame(resolve));}return result;});
    const first=samples[0];check(name+' keeps stable real geometry while presentation moves',samples.every(r=>Math.abs(r.x-first.x)<.5&&Math.abs(r.y-first.y)<.5&&Math.abs(r.w-first.w)<.5&&Math.abs(r.h-first.h)<.5&&r.overflowX<1&&r.overflowY<1),samples);
    await page.waitForTimeout(200);await page.keyboard.press('Escape');await page.waitForTimeout(230);
   }
   if(!baseline&&engine==='chrome'&&options.width===390){
    await open();await page.waitForTimeout(330);const touchBox=await stage().boundingBox(),cx=touchBox.x+touchBox.width/2,cy=touchBox.y+touchBox.height/2,cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-40,y:cy,id:1},{x:cx+40,y:cy,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-75,y:cy,id:1},{x:cx+75,y:cy,id:2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const pinch=await stage().evaluate(el=>Number(el.dataset.scale));check('native two-touch pinch zooms without a gallery swipe',pinch>1.5&&(await page.locator('.article-image-navigation [role=status]').innerText())==='1 / 3',{scale:pinch});
    await page.getByRole('button',{name:'适应窗口',exact:true}).click();await page.waitForTimeout(250);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx+70,y:cy,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-70,y:cy+3,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    check('native fitted swipe selects the next image',(await page.locator('.article-image-navigation [role=status]').innerText())==='2 / 3');
    await page.keyboard.press('Escape');await page.waitForTimeout(250);await cdp.detach();
   }
   row.passed=row.checks.every(check=>check.passed);
  }catch(error){row.error=error.stack;await page.screenshot({path:path.join(dir,'failure.png'),timeout:5000}).catch(()=>{});throw error;}
  finally{const video=page.video();await context.close();await video.saveAs(path.join(dir,'image-flow.webm'));fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));}
 }
 assert.deepEqual(report.pageerrors,[]);report.recordingComplete=true;report.passed=report.cases.every(row=>row.passed);
}catch(error){report.error=error.stack;report.passed=false;process.exitCode=1;console.error(error);}finally{await browser?.close();fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,recordingComplete:report.recordingComplete,cases:report.cases.map(({width,reduced,passed})=>({width,reduced,passed})),pageerrors:report.pageerrors}));}})();
