const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async () => {
 const {createServer} = await import('vite');
 const server = await createServer({server:{host:'127.0.0.1',port:4198,strictPort:true}});
 await server.listen();
 let browser;
 try {
  browser = await chromium.launch({headless:true, ...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE,args:['--no-sandbox']} : {})});
  const page = await browser.newPage({locale:'zh-CN',viewport:{width:1280,height:800}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const held = new Map(); let delay=false, fail=false;
  const row=(id,type='update')=>({id,activity_id:`${type}-${id}`,type,path:`/updates/${id}`,title:`row-${id}`,excerpt:`record-${id}`,published_at:'2026-11-01',cover_image:''});
  await page.route('**/api/**', async route=>{
   const url=new URL(route.request().url()); let body={};
   if(url.pathname==='/api/settings/site') body={brand:{site_title:'Test'},footer:{}};
   else if(url.pathname==='/api/auth/session') body={user:null};
   else if(url.pathname==='/api/activity') {
    const type=url.searchParams.get('type')||'',n=Number(url.searchParams.get('page')||1);
    if(delay&&type==='post') await new Promise(resolve=>held.set(type,resolve));
    if(fail&&type==='release') {await route.fulfill({status:500,json:{message:'fixture failure'}});return;}
    const items=type==='release'?[]:Array.from({length:8},(_,i)=>row((type==='update'?100:0)+(n-1)*8+i+1));
    body={items,total:type==='release'?0:16,page:n,pageSize:8};
   } else if(url.pathname.startsWith('/api/updates/')) body={id:1,content:'detail fixture',published_at:'2026-11-01'};
   else if(url.pathname.includes('comments')) body=[];
   else if(url.pathname==='/api/subscriptions/status') body={available:false};
   else if(url.pathname.includes('weather')) body={status:'disabled'};
   await route.fulfill({json:body}).catch(()=>{});
  });
  await page.goto('http://127.0.0.1:4198/updates');
  await page.locator('.updates-row').first().waitFor();
  delay=true; await page.getByRole('radio',{name:'文章',exact:true}).click();
  await page.getByText('正在更新文章，当前仍显示全部更新',{exact:true}).waitFor();
  assert.equal(await page.locator('.updates-row').count(),8);
  assert.equal(await page.locator('.updates-pagination button').isDisabled(),true);
  assert.equal(await page.locator('.updates-skeleton').count(),0);
  await page.getByRole('radio',{name:'近况',exact:true}).click();
  await page.locator('[data-activity="update-101"]').waitFor();
  held.get('post')?.(); delay=false;
  await page.waitForTimeout(200);
  assert.equal(await page.locator('[data-activity="update-1"]').count(),0);
  fail=true; await page.getByRole('radio',{name:'项目版本',exact:true}).click();
  await page.getByText('项目版本更新加载失败，当前仍显示近况更新',{exact:true}).waitFor();
  fail=false; await page.getByRole('button',{name:'重试',exact:true}).click();
  await page.getByText('这个分类下还没有更新',{exact:true}).waitFor();
  assert.equal(await page.locator('.updates-row').count(),0);
  await page.getByRole('radio',{name:'全部',exact:true}).focus();
  await page.getByRole('radio',{name:'全部',exact:true}).press('ArrowRight');
  await page.waitForFunction(()=>document.activeElement?.getAttribute('role')==='radio'&&document.activeElement?.textContent==='文章');
  await page.locator('.updates-row').first().waitFor();
  await page.getByRole('button',{name:'加载更多',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.updates-row').length===16);
  const link=page.locator('.updates-row').last(); await link.scrollIntoViewIfNeeded();
  const y=await page.evaluate(()=>scrollY); await link.click();
  await page.locator('.note-v2-body').waitFor(); await page.goBack();
  await page.waitForFunction(()=>document.querySelectorAll('.updates-row').length===16);
  await page.waitForFunction(y=>Math.abs(scrollY-y)<5,y);
  assert.deepEqual(errors,[]);
  console.log('PASS experience: retained results, race, failure/retry, empty, keyboard, pagination and back/scroll');
 } finally {await browser?.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
