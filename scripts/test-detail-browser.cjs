const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const { preview } = await import('vite');
  const server = await preview({ preview: { host:'127.0.0.1', port:4202, strictPort:true } });
  let browser;
  try {
    browser = await chromium.launch({ headless:true, ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {}) });
    const page = await browser.newPage({ reducedMotion:'reduce' });
    const measurements=[];
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    const content='## 阅读体验\n\n统一正文、标题和侧边信息的位置，让阅读更轻松。\n\n## 功能说明\n\n正文内容保留原有的 Markdown 格式。\n\n## 使用方式\n\n在手机与电脑上打开页面。';
    const author={author_name:'这是用于检验窄屏排版的很长用户名', author_avatar:'/login-icons/microsoft.svg',published_at:'2026-09-14T00:00:00Z'};
    async function assertArticlePills(covered, width) {
      const header=page.locator(covered?'.article-has-cover .hero-band':'.article-no-cover .hero-heading');
      assert.equal(await header.count(),1);
      assert.equal(await page.locator(covered?'.hero-heading':'.hero-band').count(),0);
      assert.equal(await page.locator('.hero-card').count(),covered?1:0);
      for(const dark of [false,true]) {
        await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);
        for(const row of ['.detail-breadcrumb','.detail-label']) {
          const pill=header.locator(`${row} ${covered?'.hero-pill':'.hero-pill--light'}`);
          assert.equal(await pill.count(),1,`${width} ${dark?'dark':'light'} ${row}: expected capsule variant`);
          await page.mouse.move(0,0);
          const base=await pill.evaluate(el=>{
            const s=getComputedStyle(el),before=getComputedStyle(el,'::before');
            const probe=document.createElement('span');el.append(probe);
            const color=value=>{probe.style.color=value;return getComputedStyle(probe).color;};
            const expected={text:color('var(--text-primary)'),fill:color('var(--fill)'),hover:color('var(--heading-pill-hover)'),focus:color('var(--article-accent)'),background:color('var(--background)')};probe.remove();
            return {background:s.backgroundColor,color:s.color,radius:s.borderRadius,borders:[s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth],transform:s.transform,shadow:s.boxShadow,textShadow:s.textShadow,filter:s.filter,backdrop:s.backdropFilter,font:s.font,padding:s.padding,targetHeight:Math.max(el.getBoundingClientRect().height,parseFloat(before.height)||0),expected};
          });
          assert.equal(base.radius,'999px');assert.deepEqual(base.borders,['0px','0px','0px','0px']);
          assert.equal(base.transform,'none');assert.equal(base.shadow,'none');assert.equal(base.textShadow,'none');assert.equal(base.filter,'none');assert.equal(base.backdrop,'none');
          assert.ok(base.targetHeight>=44,'capsule hit area must be at least 44px');
          assert.equal(base.color,covered?'rgb(255, 255, 255)':base.expected.text);
          assert.equal(base.background,covered?'rgba(255, 255, 255, 0.1)':base.expected.fill);
          if(!covered) {
            const heading=await header.evaluate(el=>({background:getComputedStyle(el).backgroundColor,image:getComputedStyle(el).backgroundImage}));
            assert.equal(heading.background,base.expected.background);assert.equal(heading.image,'none');
          }
          await pill.hover();
          const hover=await pill.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color,transform:s.transform,shadow:s.boxShadow,filter:s.filter,backdrop:s.backdropFilter,font:s.font,padding:s.padding};});
          assert.equal(hover.background,covered?'rgba(255, 255, 255, 0.18)':base.expected.hover);
          for(const key of ['color','transform','shadow','filter','backdrop','font','padding'])assert.equal(hover[key],base[key],`hover only changes background: ${key}`);
          if(covered) {
            await page.mouse.down();
            assert.equal(await pill.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(255, 255, 255, 0.24)');
            await page.mouse.move(0,0);await page.mouse.up();
          }
          await page.mouse.move(0,0);await pill.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
          const focus=await pill.evaluate(el=>({visible:el.matches(':focus-visible'),style:getComputedStyle(el).outlineStyle,width:getComputedStyle(el).outlineWidth,color:getComputedStyle(el).outlineColor}));
          assert.equal(focus.visible,true);assert.equal(focus.style,'solid');assert.equal(focus.width,'2px');assert.equal(focus.color,covered?'rgba(255, 255, 255, 0.85)':base.expected.focus);
          await pill.evaluate(el=>el.blur());
        }
      }
      await page.evaluate(()=>document.documentElement.classList.remove('dark'));
    }
    await page.route('**/api/**', route=>{
      const path=new URL(route.request().url()).pathname; let json={};
      if(path==='/api/auth/session')json={user:null};
      if(path.includes('/comments'))json=[];
      if(/^\/api\/posts\/[12]$/.test(path)){const id=Number(path.split('/').at(-1));json={id,title:'博客前端视觉重构与阅读体验',content,summary:'同一套布局，适配不同类型的内容。',...author,cover_image:id===2?'/login-icons/microsoft.svg':null,category:'开发记录与前端设计',tags:['React','移动端适配','长标签测试'.repeat(12)]};}
      if(path.startsWith('/api/projects/'))json={id:1,name:'PromptDock',content,stage:'active',summary:'原生 macOS 提示词管理工具',...author,tech_stack:'SwiftUI · SwiftData · AppKit',demo_url:'https://example.com',repo:'example/project',releases:{items:[],page:1,total:0,pageSize:20}};
      if(path==='/api/updates/1')json={id:1,...author,content:'QQ 和 Google 登录已经开放，欢迎在账号设置中绑定体验。'};
      if(/^\/api\/posts\/[12]\/discovery$/.test(path))json={related:[],previous:null,next:null};
      if(/^\/api\/series\/article\/[12]$/.test(path))json=null;
      if(path.startsWith('/api/analytics/'))json={views:123456};
      return route.fulfill({json});
    });
    for(const width of [1920,1440,1100,768,375,320]){
      await page.setViewportSize({width,height:900}); let expected;
      for(const [name,path] of [['article','/article/1'],['article-cover','/article/2'],['project','/projects/promptdock']]){
        const isArticle=name.startsWith('article');
        await page.goto('http://127.0.0.1:4202'+path);
        await page.locator('.detail-title').waitFor();
        if(isArticle)await page.getByLabel('123456 次阅读',{exact:true}).waitFor();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} ${width} page overflow`);
        const outer=await page.locator('main.detail-container').evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {left:r.left,right:el.parentElement.getBoundingClientRect().right-r.right,width:r.width,paddingLeft:s.paddingLeft,paddingRight:s.paddingRight};});
        assert.ok(Math.abs(outer.left-outer.right)<1, `${name} ${width}: equal outer gutters ${JSON.stringify(outer)}`);
        assert.equal(outer.paddingLeft,'0px');assert.equal(outer.paddingRight,'0px');
        const usableWidth=await page.locator('main.detail-container').evaluate(el=>el.parentElement.getBoundingClientRect().width);
        if(width>=1440){assert.equal(outer.width,isArticle?usableWidth:1200);measurements.push({name,viewport:width,...outer});}
        const pill=await page.locator(isArticle?`.detail-label ${name==='article-cover'?'.hero-pill':'.hero-pill--light'}`:'.detail-category').evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,radius:s.borderRadius};});
        assert.notEqual(pill.background,'rgba(0, 0, 0, 0)');assert.equal(pill.radius,'999px');
        if(isArticle)await assertArticlePills(name==='article-cover',width);
        const body=await page.locator('.detail-body').boundingBox();
        if(isArticle){
          if(width>=1100)assert.equal(body.width,720);
          assert.ok(Math.abs(body.x+body.width/2-(outer.left+outer.width/2))<1,'article reading column centered');
          const groups=await page.locator('.hero-meta .g').evaluateAll(es=>es.map(e=>({y:e.getBoundingClientRect().y,white:getComputedStyle(e).whiteSpace})));
          assert.ok(groups.length>=1);groups.forEach(g=>assert.equal(g.white,'nowrap'));
          if(width>=1440){const footer=await page.locator('.site-footer .site-container').boundingBox();const subscribe=await page.locator('.subscribe-inner').boundingBox();assert.equal(footer.width,1200);assert.equal(subscribe.width,1200);}
        }
        if(name==='project'){
        if(width>=1100)assert.ok(body.width>=640 && body.width<=680);
        const row=page.locator('.detail-meta');
        const metrics=await row.evaluate(el=>({height:el.getBoundingClientRect().height,children:Array.from(el.children).map(c=>({center:c.getBoundingClientRect().y+c.getBoundingClientRect().height/2,shrink:getComputedStyle(c).flexShrink,white:getComputedStyle(c).whiteSpace})),overflow:getComputedStyle(el).overflowX}));
        assert.ok(metrics.height<=32);assert.equal(metrics.overflow,'auto');
        for(const c of metrics.children){assert.equal(c.shrink,'0');assert.equal(c.white,'nowrap');assert.ok(Math.abs(c.center-metrics.children[0].center)<1);}
        }
        const aside=page.locator('.detail-aside');
        if(await aside.count()){
          await page.locator('.detail-panel:not([data-initial])').waitFor();
          await page.waitForFunction(expected => document.querySelector('.detail-panel').open === expected, width >= 1100);
          if(width<1100){assert.ok((await aside.boundingBox()).y>=body.y+body.height-1);assert.equal(await page.locator('.detail-panel').getAttribute('open'),null);await page.locator('.detail-panel summary').click();await page.locator('.detail-panel-content').waitFor({state:'visible'});await page.locator('.detail-panel summary').click();}
          else {
            const box=await aside.boundingBox();
            assert.equal(box.width,220, 'sidebar must not absorb unused container width');
            const container=await page.locator('.detail-page').boundingBox();
            assert.ok(Math.abs(box.x+box.width-container.x-container.width)<1, 'sidebar reaches reading group right edge');
            assert.ok(box.x-body.x-body.width>=16 && box.x-body.x-body.width<=24, 'body to divider gap');
            const style=await aside.evaluate(el=>({left:getComputedStyle(el).borderLeftWidth,padding:getComputedStyle(el).paddingLeft}));
            assert.equal(style.left,'1px');assert.ok(parseFloat(style.padding)>=16 && parseFloat(style.padding)<=24);
          }
          const panel=await page.locator('.detail-panel').evaluate(el=>{const s=getComputedStyle(el);return {borders:[s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth],background:s.backgroundColor,radius:s.borderRadius};});
          assert.deepEqual(panel.borders,['0px','0px','0px','0px']);assert.equal(panel.background,'rgba(0, 0, 0, 0)');assert.equal(panel.radius,'0px');
          assert.equal(await page.locator('.detail-panel-content').evaluate(el=>getComputedStyle(el).paddingRight),'0px');
        }
        if(width<=375){assert.equal(await page.locator('.detail-title').evaluate(el=>getComputedStyle(el).fontSize),'28px');await page.getByRole('button',{name:'打开菜单',exact:true}).click();await page.getByRole('navigation',{name:'手机导航'}).waitFor();await page.keyboard.press('Escape');}
        await page.screenshot({path:`.cache/detail-${name}-${width}.png`,fullPage:true});
        if(width===375){await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.screenshot({path:`.cache/detail-${name}-dark.png`,fullPage:true});await page.evaluate(()=>document.documentElement.classList.remove('dark'));}
      }
    }
    // A single mounted sidebar follows breakpoint changes and native summary keyboard activation.
    await page.setViewportSize({width:1100,height:900});
    await page.goto('http://127.0.0.1:4202/projects/promptdock');
    await page.locator('.detail-panel:not([data-initial])').waitFor();
    await page.waitForFunction(()=>document.querySelector('.detail-panel').open===true);
    await page.setViewportSize({width:1099,height:900});
    await page.waitForFunction(()=>document.querySelector('.detail-panel').open===false);
    await page.locator('.detail-panel summary').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('.detail-panel').open===true);
    await page.keyboard.press('Space');
    await page.waitForFunction(()=>document.querySelector('.detail-panel').open===false);
    await page.setViewportSize({width:1100,height:900});
    await page.waitForFunction(()=>document.querySelector('.detail-panel').open===true);
    // Updates use their own journal layout rather than the article sidebar grid.
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({width,height:900});
      await page.goto('http://127.0.0.1:4202/updates/1');
      await page.getByRole('heading',{name:'一则近况',exact:true}).waitFor();
      await page.locator('.update-reading').waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`journal ${width} overflow`);
      assert.equal(await page.locator('.detail-aside').count(),0);
      await page.getByRole('link',{name:'← 最近更新',exact:true}).waitFor();
    }
    require('node:fs').writeFileSync('.cache/centering-measurements.json',JSON.stringify(measurements,null,2)+'\n');
    assert.deepEqual(errors,[]);
    console.log('PASS: shared 640–680px column, covered/coverless capsules in both themes, aligned atomic metadata, 375px/320px navigation, sidebar folding and no page overflow.');
  } finally { await browser?.close(); await server.httpServer.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
