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
    await page.route('**/api/**', route=>{
      const path=new URL(route.request().url()).pathname; let json={};
      if(path==='/api/auth/me')json={user:null};
      if(path.includes('/comments'))json=[];
      if(path==='/api/posts/1')json={id:1,title:'博客前端视觉重构与阅读体验',content,summary:'同一套布局，适配不同类型的内容。',...author,category:'开发记录与前端设计',tags:['React','移动端适配','长标签测试'.repeat(12)]};
      if(path.startsWith('/api/projects/'))json={id:1,name:'PromptDock',content,stage:'active',summary:'原生 macOS 提示词管理工具',...author,tech_stack:'SwiftUI · SwiftData · AppKit',demo_url:'https://example.com',repo:'example/project',releases:{items:[],page:1,total:0,pageSize:20}};
      if(path==='/api/updates/1')json={id:1,...author,content:'QQ 和 Google 登录已经开放，欢迎在账号设置中绑定体验。'};
      if(path.startsWith('/api/analytics/'))json={views:123456};
      return route.fulfill({json});
    });
    for(const width of [1920,1440,1100,768,375,320]){
      await page.setViewportSize({width,height:900}); let expected;
      for(const [name,path] of [['article','/article/1'],['project','/projects/promptdock'],['update','/updates/1']]){
        await page.goto('http://127.0.0.1:4202'+path);
        await page.locator('.detail-title').waitFor();
        if(name==='article')await page.getByLabel('123456 次阅读',{exact:true}).waitFor();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} ${width} page overflow`);
        const outer=await page.locator('main.detail-container').evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {left:r.left,right:el.parentElement.getBoundingClientRect().right-r.right,width:r.width,paddingLeft:s.paddingLeft,paddingRight:s.paddingRight};});
        assert.ok(Math.abs(outer.left-outer.right)<1, `${name} ${width}: equal outer gutters ${JSON.stringify(outer)}`);
        assert.equal(outer.paddingLeft,'0px');assert.equal(outer.paddingRight,'0px');
        if(width>=1440){assert.equal(outer.width,1200);measurements.push({name,viewport:width,...outer});}
        const pill=await page.locator('.detail-category').evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,radius:s.borderRadius};});
        assert.notEqual(pill.background,'rgba(0, 0, 0, 0)');assert.equal(pill.radius,'999px');
        const body=await page.locator('.detail-body').boundingBox();
        if(expected){assert.ok(Math.abs(body.x-expected.x)<1);assert.ok(Math.abs(body.width-expected.width)<1);}
        expected=body;
        if(width>=1100)assert.ok(body.width>=640 && body.width<=680);
        const row=page.locator('.detail-meta');
        const metrics=await row.evaluate(el=>({height:el.getBoundingClientRect().height,children:Array.from(el.children).map(c=>({center:c.getBoundingClientRect().y+c.getBoundingClientRect().height/2,shrink:getComputedStyle(c).flexShrink,white:getComputedStyle(c).whiteSpace})),overflow:getComputedStyle(el).overflowX}));
        assert.ok(metrics.height<=32);assert.equal(metrics.overflow,'auto');
        for(const c of metrics.children){assert.equal(c.shrink,'0');assert.equal(c.white,'nowrap');assert.ok(Math.abs(c.center-metrics.children[0].center)<1);}
        const aside=page.locator('.detail-aside');
        if(await aside.count()){
          if(width<1100){assert.ok((await aside.boundingBox()).y>=body.y+body.height-1);assert.equal(await page.locator('.detail-panel').getAttribute('open'),null);await page.locator('.detail-panel summary').click();await page.locator('.detail-panel-content').waitFor({state:'visible'});await page.locator('.detail-panel summary').click();}
          else {
            const box=await aside.boundingBox();
            const container=await page.locator('.page-content').boundingBox();
            assert.ok(Math.abs(box.x+box.width-container.x-container.width)<1, 'sidebar reaches container right edge');
            assert.ok(box.x-body.x-body.width>=16 && box.x-body.x-body.width<=24, 'body to divider gap');
            const style=await aside.evaluate(el=>({left:getComputedStyle(el).borderLeftWidth,padding:getComputedStyle(el).paddingLeft}));
            assert.equal(style.left,'1px');assert.ok(parseFloat(style.padding)>=16 && parseFloat(style.padding)<=24);
          }
          const panel=await page.locator('.detail-panel').evaluate(el=>{const s=getComputedStyle(el);return {borders:[s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth],background:s.backgroundColor,radius:s.borderRadius};});
          assert.deepEqual(panel.borders,['0px','0px','0px','0px']);assert.equal(panel.background,'rgba(0, 0, 0, 0)');assert.equal(panel.radius,'0px');
          assert.equal(await page.locator('.detail-panel-content').evaluate(el=>getComputedStyle(el).paddingRight),'0px');
        }
        if(width<=375){assert.equal(await page.locator('.detail-title').evaluate(el=>getComputedStyle(el).fontSize),'24px');await page.getByRole('button',{name:'打开菜单',exact:true}).click();await page.getByRole('navigation',{name:'手机导航'}).waitFor();await page.keyboard.press('Escape');}
        await page.screenshot({path:`.cache/detail-${name}-${width}.png`,fullPage:true});
        if(width===375){await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.screenshot({path:`.cache/detail-${name}-dark.png`,fullPage:true});}
      }
    }
    require('node:fs').writeFileSync('.cache/centering-measurements.json',JSON.stringify(measurements,null,2)+'\n');
    assert.deepEqual(errors,[]);
    console.log('PASS: shared 640–680px column, aligned atomic metadata, 375px/320px navigation, sidebar folding, dark theme and no page overflow.');
  } finally { await browser?.close(); await server.httpServer.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
