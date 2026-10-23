const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
(async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({server:{host:'127.0.0.1',port:5003,strictPort:true},logLevel:'error'});await server.listen();
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  const page=await browser.newPage({reducedMotion:'reduce'}),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  const title='A'.repeat(160),content='## '+title+'\n\n正文\n\n```js\nconst x = "'+title.repeat(4)+'";\n```\n\n![图片](data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1200" height="200"%3E%3C/svg%3E)';
  let failPosts=false;
  await page.route('**/api/**',route=>{
   const url=new URL(route.request().url()),p=url.pathname;let json={};
   if(p==='/api/auth/session')json={user:null};
   if(p==='/api/posts/meta/categories')json=[{category:'技术',count:25}];
   if(p==='/api/posts/meta/tags')json=[{tag:'标签',count:25}];
   if(p==='/api/posts'){
    requests.push(url.searchParams.get('page'));
    if(failPosts)return route.fulfill({status:500,json:{message:'暂时无法加载'}});
    const n=Number(url.searchParams.get('page')||1),total=url.searchParams.get('search')==='empty'?0:25;
    json={items:n<=Math.ceil(total/12)?[{id:1,title,summary:'文章摘要',tags:[],updated_at:'2026-10-23'}]:[],total,page:n,pageSize:12};
   }
   if(p==='/api/posts/1')json={id:1,title,content,summary:'文章摘要',author_name:'作者',tags:[]};
   if(p==='/api/posts/1/discovery')json={related:[],previous:null,next:null};
   if(p==='/api/series/article/1')json=null;
   if(p.includes('/comments'))json=[];
   return route.fulfill({json});
  });
  const base='http://127.0.0.1:5003';
  await page.goto(base+'/search?q=hello&category=技术&tag=标签&page=2');
  await page.getByText('2 / 3',{exact:true}).waitFor();
  await page.getByRole('link',{name:'下一页',exact:true}).click();await page.getByText('3 / 3',{exact:true}).waitFor();
  await page.reload();await page.getByText('3 / 3',{exact:true}).waitFor();
  await page.goBack();await page.getByText('2 / 3',{exact:true}).waitFor();
  await page.getByRole('searchbox').fill('changed');await page.getByRole('button',{name:'搜索',exact:true}).click();
  await page.getByText('1 / 3',{exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('page'),null);assert.equal(new URL(page.url()).searchParams.get('category'),'技术');
  for(const bad of ['Infinity','1.5','-2']){
   await page.goto(base+'/articles?page='+bad);await page.getByText('1 / 3',{exact:true}).waitFor();await page.waitForURL(url=>!url.searchParams.has('page'));
  }
  await page.goto(base+'/search?q=hello&page=2');await page.getByText('2 / 3',{exact:true}).waitFor();
  await page.getByRole('radio',{name:'技术',exact:true}).click();await page.getByText('1 / 3',{exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('category'),'技术');assert.equal(new URL(page.url()).searchParams.get('page'),null);
  await page.goto(base+'/tag/标签?page=2');await page.getByText('2 / 3',{exact:true}).waitFor();await page.reload();await page.getByText('2 / 3',{exact:true}).waitFor();
  await page.goto(base+'/articles?page=999');await page.getByText('3 / 3',{exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('page'),'3');
  await page.goto(base+'/search?q=empty&page=2');await page.getByText('没有符合当前条件的文章。',{exact:true}).waitFor();await page.waitForURL(url=>!url.searchParams.has('page'));
  failPosts=true;await page.goto(base+'/search?q=failure');await page.getByRole('button',{name:'重试',exact:true}).waitFor();failPosts=false;await page.getByRole('button',{name:'重试',exact:true}).click();await page.getByText('1 / 3',{exact:true}).waitFor();
  await fs.mkdir('.cache/discovery-qa',{recursive:true});
  for(const width of [1920,1280,1024,768,375])for(const dark of [false,true]){
   await page.setViewportSize({width,height:1000});
   for(const path of ['/search?q=hello','/category/'+title,'/article/1']){
    await page.goto(base+path);await page.locator(path==='/article/1'?'.detail-title':'.discovery-results .blog-card').waitFor();
    await page.evaluate(d=>{document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.moonTheme=d?'dark':'light';},dark);
    if(path==='/article/1'&&width<1280){await page.getByRole('button',{name:/^目录/}).click();assert.ok(await page.locator('#article-narrow-directory').isVisible());}
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${path} ${width} ${dark} overflow`);
    await page.screenshot({path:`.cache/discovery-qa/${path.startsWith('/article')?'article':path.startsWith('/category')?'category':'search'}-${width}-${dark}.png`});
   }
  }
  assert.ok(requests.every(n=>Number.isSafeInteger(Number(n))&&Number(n)>=1));assert.deepEqual(errors,[]);
  console.log('PASS: search URL/reload/back/filter reset, invalid and out-of-range page recovery, empty/error/retry, long title/code/image/TOC at 5 widths in both themes.');
 }finally{await browser?.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

