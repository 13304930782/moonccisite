const assert = require('node:assert/strict');
const {chromium} = require('playwright');

(async () => {
  const {preview} = await import('vite');
  const server = await preview({preview:{host:'127.0.0.1',port:4991,strictPort:true},logLevel:'error'});
  let browser;
  try {
    browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
    const page = await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}), errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    const user = {id:1,username:'本地验证',email:'preview@example.invalid',role:'owner',status:'active',version:1,can_comment:1};
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() !== 'GET' && path !== '/api/weather-mood') writes.push(request.method() + ' ' + path);
      let body = {items:[],total:0,page:1,pageSize:50};
      if (path === '/api/auth/session' || path === '/api/account') body = {user};
      else if (path === '/api/settings/site') body = {brand:{},hero:{},footer:{},weather:{enabled:false}};
      else if (path === '/api/auth/connections') body = {providers:[]};
      else if (['/api/publishing/config','/api/engagement/config','/api/account/security-config'].includes(path)) body = {enabled:true};
      else if (path === '/api/engagement/notifications/unread') body = {unread:0};
      else if (path === '/api/admin/stats') body = {posts:0,users:1,comments:0,bannedWords:0};
      else if (path === '/api/settings/mail') body = {};
      else if (path === '/api/admin/banned-words') body = [];
      else if (path === '/api/engagement/preferences') body = {history_enabled:true,email_verified:false,comment_email:false,reply_email:false};
      else if (path === '/api/account/sessions') body = {items:[{id:'fixture',browser:'Edge',os:'Windows',current:true,legacy:false,first_seen:Date.now(),last_seen:Date.now(),expires_at:Date.now()+86400000}]};
      else if (path === '/api/engagement/notifications') body = {items:[{id:1,title:'本地通知',message:'仅用于布局验证',is_read:false,available:true,url:'/article/1',created_at:'2026-10-14T12:00:00Z'}],unread:1};
      else if (path === '/api/engagement/history') body = {items:[{post_id:1,title:'本地阅读记录',progress:.45,updated_at:Date.now(),available:true}],total:1};
      else if (path === '/api/article-drafts') body = {items:[{id:'fixture',payload:{title:'本地投稿'},version:1,updated_at:'2026-10-14T12:00:00Z',workflow:{state:'submitted'},post_id:1}],total:1,page:1};
      else if (path === '/api/mailboxes/me') body = {access:{status:'pending',mailbox_address:null,daily_limit:10,review_note:null}};
      else if (path === '/api/node-monitor/snapshot') body = {nodes:[],checkedAt:'2026-10-14T12:00:00Z'};
      await route.fulfill({json:body});
    });
    const goto = path => page.goto('http://127.0.0.1:4991' + path);
    const target = async locator => {
      const box = await locator.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, '44px target: ' + await locator.textContent());
    };
    const overflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page overflow');

    await goto('/admin');
    const trigger = page.getByRole('button',{name:'打开后台菜单',exact:true});
    try { await trigger.waitFor(); } catch (error) { console.error('Local fixture errors:',errors,await page.locator('body').innerText()); throw error; }
    await target(trigger); await trigger.click();
    const menu = page.getByRole('dialog',{name:'后台导航',exact:true}); await menu.waitFor();
    await page.waitForFunction(() => document.querySelector('#admin-mobile-menu')?.contains(document.activeElement));
    assert.ok(await page.locator('.admin-main').evaluate(element => element.inert));
    assert.ok(await page.locator('.admin-mobile-bar').evaluate(element => element.inert));
    const limits = await menu.evaluate(element => {
      const items = [...element.querySelectorAll('a[href],button,summary')].filter(item => item.tabIndex >= 0 && !item.matches(':disabled') && item.getClientRects().length);
      items.at(-1).focus(); return {first:items[0].textContent,last:items.at(-1).textContent};
    });
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), limits.first);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), limits.last);
    for (const locator of await menu.locator('summary,a').all()) if (await locator.isVisible()) {
      const box = await locator.boundingBox(); assert.ok(box.height >= 44, 'menu row height: ' + await locator.textContent());
    }
    await target(menu.getByRole('button',{name:'关闭后台菜单',exact:true}));
    await page.keyboard.press('Escape'); await menu.waitFor({state:'detached'});
    assert.ok(await trigger.evaluate(element => element === document.activeElement));
    assert.equal(await page.locator('.admin-main').evaluate(element => element.inert), false);
    await trigger.click(); await menu.waitFor(); await page.setViewportSize({width:1440,height:900});
    await menu.waitFor({state:'detached'}); assert.equal(await page.locator('.admin-main').evaluate(element => element.inert), false);
    await page.setViewportSize({width:390,height:844});

    await goto('/admin/comments');
    await page.getByLabel('搜索评论、用户、邮箱、内容或 IP',{exact:true}).waitFor();
    await target(page.getByRole('navigation',{name:'评论管理分页'}).getByRole('button',{name:'上一页'}));
    await target(page.getByRole('navigation',{name:'评论管理分页'}).getByRole('button',{name:'下一页'}));
    await overflow();
    await goto('/admin/banned-words');
    await page.getByLabel('违禁词',{exact:true}).waitFor(); await page.getByLabel('替换为',{exact:true}).waitFor();
    await goto('/admin/mail-settings');
    for (const label of ['SMTP 服务器','SMTP 端口','默认 SMTP 登录邮箱','默认邮箱密码','默认发件地址','接收提醒邮箱','站点地址','Early Access 下载地址']) await page.getByLabel(label,{exact:true}).waitFor();
    await overflow();

    await goto('/account/settings'); await page.getByLabel('用户名',{exact:true}).waitFor();
    await target(page.getByRole('link',{name:'返回网站',exact:true}));
    await target(page.getByRole('button',{name:'退出登录',exact:true}));
    const upload = page.getByLabel('上传头像',{exact:true});
    assert.equal(await upload.evaluate(element => getComputedStyle(element).opacity), '0');
    await target(page.locator('.account-upload-trigger'));
    await upload.focus(); assert.equal(await page.locator('.account-upload-trigger').evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
    await overflow();
    await page.getByRole('button',{name:'切换深色主题'}).click(); await overflow();
    assert.equal(await page.locator('.account-upload-trigger').evaluate(element => getComputedStyle(element).outlineStyle), 'none');
    user.role='user';
    for (const width of [390,1440]) for (const dark of [false,true]) {
      await page.setViewportSize({width,height:900});
      await page.evaluate(value=>{localStorage.setItem('mooncci-theme',value?'dark':'light');},dark);
      for (const [path,title] of [['/account/bookmarks','我的收藏'],['/account/history','阅读历史'],['/account/notifications','通知中心'],['/account/sessions','登录设备'],['/account/submissions','我的投稿'],['/account/mailbox','我的邮箱'],['/node-monitor','节点监控']]) {
        await goto(path);
        await page.locator('h1').filter({hasText:title}).waitFor();
        const ready={'/account/bookmarks':'.account-bookmark-empty','/account/history':'.history-row','/account/notifications':'.notification-row','/account/sessions':'.session-row','/account/submissions':'.submission-row','/account/mailbox':'#mailbox-status-title','/node-monitor':'.node-summary'}[path];
        await page.locator(ready).waitFor();
        await page.evaluate(value=>{document.documentElement.classList.toggle('dark',value);document.documentElement.dataset.moonTheme=value?'dark':'light';},dark);
        await overflow();
        const opener={'/account/bookmarks':'新建收藏夹','/account/history':'清空历史','/account/notifications':'验证邮箱','/account/sessions':'退出其他会话'}[path];
        if(opener){
          const trigger=page.getByRole('button',{name:opener,exact:true});await trigger.click();
          const dialog=page.getByRole('dialog');await dialog.waitFor();
          await target(dialog.getByRole('button',{name:'关闭弹窗',exact:true}));
          await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
          await page.waitForFunction(name=>document.activeElement?.textContent?.trim()===name,opener);
          assert.ok(await trigger.evaluate(element=>element===document.activeElement),path+' dialog restores focus');
        }
      }
    }
    assert.deepEqual(writes, []); assert.deepEqual(errors, []);
    console.log('PASS: built account/admin pages, seven account/monitor routes at 390/1440 in light/dark, four account dialogs with Escape/focus restore; menu loop/resize/inert, avatar focus, SMTP labels; local API fixtures.');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
