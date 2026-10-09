const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium, webkit } = require('playwright');
(async () => {
  const vite = await (await import('vite')).createServer({ ...(process.env.UX_BASELINE ? {root:'.cache/ux-before'} : {}), server: { host:'127.0.0.1', port:4252, strictPort:true, hmr:false, watch:{ignored:['**/.cache/**','**/outputs/**']} } });
  await vite.listen();
  const browser = await (process.env.QA_BROWSER === 'webkit' ? webkit.launch() : chromium.launch({...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : process.platform === 'win32' ? {channel:'msedge'} : {})}));
  const output = 'outputs/ux-unification'; fs.mkdirSync(output, {recursive:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  let mediaFail = false, notificationFail = false, subscriptionFail = false, releaseFail = true;
  const errors = [], mutations = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.route('**/api/**', async r => {
    const q=r.request(), u=new URL(q.url()), p=u.pathname;
    if(q.method() !== 'GET') mutations.push(p);
    let json={};
    if(p==='/api/auth/session') json={user:{id:1,username:'mooncci',role:'owner',email:'owner@example.test'}};
    else if(p==='/api/settings/site') json={brand:{},hero:{title:'mooncci'},footer:{},weather:{enabled:false}};
    else if(p.endsWith('/config')) json={enabled:true};
    else if(p==='/api/admin/projects') json={items:[{id:1,name:'写作手记',slug:'writing',status:'published',stage:'building',sync_enabled:true}],total:1,page:1,pageSize:20};
    else if(p==='/api/admin/projects/1/releases') {
      if(releaseFail) return r.fulfill({status:503,json:{message:'版本暂时无法加载'}});
      json={items:[],total:0,page:1,pageSize:20};
    }
    else if(p==='/api/upload/media') {
      if(mediaFail) return r.fulfill({status:503,json:{message:'媒体服务暂时不可用'}});
      const item={filename:'sample.webp',display_name:'城市与道路',url:'/fixture.svg',size:10,size_text:'10 B',uploaded_at:'2026-09-29'};
      json={items:u.searchParams.get('q') || u.searchParams.get('status')==='trashed'?[]:[item],total:1,page:1};
    } else if(p==='/api/engagement/notifications') {
      if(notificationFail) return r.fulfill({status:503,json:{message:'通知暂时不可用'}});
      json={items:[],unread:0};
    } else if(p==='/api/engagement/preferences') json={email_verified:false,comment_email:false,reply_email:false};
    else if(p==='/api/subscriptions/status') json={available:true};
    else if(p==='/api/subscriptions') {
      if(subscriptionFail) return r.fulfill({status:503,json:{message:'暂时无法提交'}});
      json={message:'请查收确认邮件，点击邮件中的链接完成订阅。'};
    } else if(p==='/api/posts') json=[];
    else if(['/api/now','/api/activity','/api/projects','/api/updates'].includes(p)) json={items:[],total:0,page:1,pageSize:20};
    await r.fulfill({json});
  });
  await page.route('**/fixture.svg', r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#777"/></svg>'}));
  async function capture(name) {
    for(const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:1000});
      await page.screenshot({path:`${output}/${name}-${width}.png`,fullPage:true});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow '+width);
    }
  }
  try {
    if(process.env.UX_BASELINE) {
      await page.goto('http://127.0.0.1:4252/admin/media');
      await page.getByText('城市与道路',{exact:true}).first().waitFor();
      mediaFail=true;await page.getByRole('button',{name:'刷新',exact:true}).click();
      await page.getByText('服务暂时不可用，请稍后重试。',{exact:true}).waitFor();
      await capture('before-media-refresh-error');
      await page.goto('http://127.0.0.1:4252/account/notifications');
      await page.getByRole('radiogroup',{name:'消息分类'}).getByRole('radio',{name:'文章评论',exact:true}).click();
      await capture('before-notification-filter');
      await page.goto('http://127.0.0.1:4252/subscription/confirm');await page.getByRole('heading',{name:'链接无效或不完整'}).waitFor();
      await capture('before-subscription-invalid');
      console.log('Captured immutable pre-change snapshot.');return;
    }
    await page.goto('http://127.0.0.1:4252/admin/media');
    await page.getByText('城市与道路',{exact:true}).first().waitFor();
    assert.equal(await page.getByRole('navigation',{name:'媒体库分页'}).count(),0);
    assert.equal(await page.getByRole('button',{name:'正常文件',exact:true}).getAttribute('aria-pressed'),'true');
    mediaFail=true; await page.getByRole('button',{name:'刷新',exact:true}).click();
    await page.getByText('刷新失败，已保留当前图片').waitFor();
    await page.getByText('城市与道路',{exact:true}).first().waitFor();
    await capture('media-refresh-error');
    mediaFail=false; await page.getByRole('button',{name:'重新加载媒体库'}).click();
    await page.getByLabel('搜索媒体文件').fill('找不到的文件');
    await page.getByText('没有找到匹配的媒体文件。').waitFor();
    await page.getByRole('button',{name:'清除搜索'}).click();
    await page.getByText('城市与道路',{exact:true}).first().waitFor();
    notificationFail=true; await page.goto('http://127.0.0.1:4252/account/notifications');
    await page.getByRole('button',{name:'重新加载通知'}).waitFor();
    assert.equal(await page.getByText('正在加载通知…',{exact:true}).count(),0);
    notificationFail=false; await page.getByRole('button',{name:'重新加载通知'}).click();
    await page.getByRole('radiogroup',{name:'消息分类'}).getByRole('radio',{name:'文章评论',exact:true}).click();
    await page.getByRole('button',{name:'查看全部通知'}).waitFor();
    await capture('notification-filter');
    await page.getByRole('button',{name:'查看全部通知'}).click();
    await page.getByRole('heading',{name:'暂时没有通知'}).waitFor();
    await page.goto('http://127.0.0.1:4252/admin/projects');
    await page.getByRole('button',{name:'版本管理',exact:true}).click();
    await page.locator('.editor-panel').getByRole('button',{name:'重试',exact:true}).waitFor();
    releaseFail=false;await page.locator('.editor-panel').getByRole('button',{name:'重试',exact:true}).click();
    await page.getByRole('heading',{name:'暂无版本记录'}).waitFor();
    await capture('release-empty');
    await page.goto('http://127.0.0.1:4252/subscription/confirm');
    await page.getByRole('link',{name:'重新申请订阅',exact:true}).waitFor();
    await capture('subscription-invalid');
    await page.getByRole('link',{name:'重新申请订阅',exact:true}).click();
    await page.getByLabel('邮箱地址',{exact:true}).waitFor();
    await page.waitForFunction(()=>{const el=document.getElementById('subscribe');return el && el.getBoundingClientRect().top>=0 && el.getBoundingClientRect().top<innerHeight;});
    await page.getByLabel('邮箱地址',{exact:true}).fill('reader@example.test');
    subscriptionFail=true; await page.getByRole('button',{name:'订阅周报',exact:true}).click();
    await page.locator('#subscribe-message').waitFor();
    assert.equal(await page.getByLabel('邮箱地址',{exact:true}).inputValue(),'reader@example.test');
    subscriptionFail=false; await page.getByRole('button',{name:'订阅周报',exact:true}).click();
    await page.getByText('订阅申请已提交',{exact:true}).waitFor();
    await page.waitForTimeout(3300);
    await page.getByText('订阅申请已提交',{exact:true}).waitFor();
    await capture('subscription-submitted');
    await page.evaluate(()=>document.documentElement.classList.add('dark'));
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.screenshot({path:output+'/subscription-dark-reduced.png',fullPage:true});
    await page.getByRole('button',{name:'修改邮箱或重新申请'}).click();
    assert.equal(await page.getByLabel('邮箱地址',{exact:true}).inputValue(),'reader@example.test');
    assert.deepEqual(errors,[]);
    assert.deepEqual(mutations.filter(p=>!['/api/weather-mood','/api/analytics/view'].includes(p)),['/api/subscriptions','/api/subscriptions']);
    fs.writeFileSync(output+'/result-'+(process.env.QA_BROWSER||process.env.PLAYWRIGHT_CHANNEL||'msedge')+'.json',JSON.stringify({passed:true,browser:await browser.version(),widths:[320,390,768,1440],externalRequests:'blocked',realEmailSent:false,errors},null,2));
    console.log('PASS: retained media, recoverable failures, filter reset, no single-page pagination, persistent subscription feedback and input preservation; four widths.');
  } finally {await browser.close();await vite.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
