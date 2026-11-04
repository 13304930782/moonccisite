const {chooseInterfaceLanguage}=require('./fixtures/language-menu.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const server=await(await import('vite')).createServer({server:{host:'127.0.0.1',port:4267,strictPort:true,hmr:false,fs:{allow:[process.cwd(),path.resolve(require.resolve('vite'),'../../../..')]},watch:{ignored:['**/.cache/**','**/outputs/**']}}});await server.listen();
 const browser=await chromium.launch((process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})),context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:900}}),out=process.env.QA_OUTPUT||'.cache/bilingual-route-qa';await fs.mkdir(out,{recursive:true});
 let current='',errors=[],requests=[],mode='empty';const results=[];let page;
 await context.addInitScript(()=>{try{localStorage.setItem('mooncci:language',JSON.stringify({preference:'en',version:Date.now()}));localStorage.setItem('mooncci-theme','light')}catch{}});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await context.route('**/api/**',async r=>{const u=new URL(r.request().url()),p=u.pathname;requests.push(p);const anon=/^\/(login|admin-login|register|forgot-password|reset-password|complete-registration)$/.test(current);const user={id:1,role:'owner',username:'QA owner',email:'qa@example.invalid',status:'active',ui_locale:'en',can_comment:1,version:1};let data={items:[],total:0,page:1,pageSize:20};
 if(p==='/api/auth/session')data={user:anon?null:user};
 else if(p==='/api/settings/site')data={brand:{site_title:'QA blog',name:'QA'},hero:{title:'QA heading',description:'QA description'},footer:{copyright:'QA'},weather:{enabled:false}};
 else if(p==='/api/settings/blog-pages'||p==='/api/settings/blog-pages/manage')data={about:{enabled:true,name:'QA author',intro:'QA introduction',content:'QA body',avatar:'',tags:[],technologies:[],social:[],modules:[]},links:[]};
 else if(p==='/api/publishing/config'||p==='/api/engagement/config')data={enabled:true};
 else if(p==='/api/engagement/notifications/unread')data={unread:0};
 else if(p==='/api/auth/providers'||p==='/api/auth/connections'||p==='/api/auth/providers/manage')data={providers:[]};
 else if(p==='/api/account'||/\/admin\/users\/[^/]+\/settings/.test(p))data={user};
 else if(mode==='failure')return r.fulfill({status:503,json:{message:'Service unavailable'}});
 else if(/^\/api\/updates\/\d+$/.test(p))data={id:1,content:process.env.QA_EMPTY_NOTE?'  \t ':'QA note',published_at:'2026-11-01T10:00:00Z',author_name:'QA owner'};
 else if(/^\/api\/projects\/[^/]+$/.test(p))data={id:1,title:'QA project',name:'QA project',slug:'qa',summary:'QA description',content:'QA body',status:'published',links:[],releases:{items:[],total:0,page:1,pageSize:20}};
 else if(/^\/api\/posts\/(?:\d+|qa)$/.test(p))data={id:1,title:'QA article',slug:'qa',content:'QA body',summary:'QA summary',tags:[],status:'published',content_locale:'en',available_locales:['zh-CN','en'],published_at:'2026-11-01T10:00:00Z'};
 else if(p.startsWith('/api/comments/')||p==='/api/admin/banned-words'||p==='/api/admin/editor-applications')data=[];
 else if(p==='/api/series/article/1')data=null;
 else if(p.endsWith('/discovery'))data={related:[],previous:null,next:null};
 else if(p==='/api/series/qa')data={series:{id:1,title:'QA series',description:'QA description'},items:[]};
 else if(p==='/api/admin/newsletter')data={enabled:false,deliveryConfigured:false,counts:[],runs:[],deliveries:{items:[],total:0,page:1,pageSize:20}};
 else if(p==='/api/admin/newsletter/preview')data=null;
 else if(p==='/api/electricity/rooms'||p==='/api/admin/electricity/rooms')data={data:[]};
 else if(p==='/api/mailboxes/admin/requests')data={requests:[],counts:{},total:0,page:1,limit:20};
 else if(p==='/api/admin/operations')data={summary:{pending:0,scheduled:0,failed:0,mailFailed:0,views:0,comments:0,bookmarks:0},trend:[],articles:[],tasks:[{draft_id:'qa-task',title:'QA scheduled article',state:'scheduled',scheduled_at:1793520000000,reason:''}],start:'2026-11-01',end:'2026-11-04'};
 else if(p.startsWith('/api/settings/festivals')){const f=require('../server/src/lib/festivals'),config=f.defaults();data=p.endsWith('/active')?f.evaluate(config,Date.now()):{config,catalog:f.catalog,state:f.evaluate(config,Date.now())};}
 else if(p==='/api/now')data={content:'',updated_at:null};
 else if(p==='/api/posts')data=u.searchParams.get('format')==='paged'?{items:[],total:0,page:1,pageSize:20}:[];
 else if(p.startsWith('/api/posts/meta/'))data=[];
 else if(p==='/api/article-seo/settings')data={enabled:false,has_key:false,model:'deepseek-chat'};
 else if(p==='/api/node-monitor/settings')data={configured:false};
 else if(p==='/api/settings/mail')data={smtp_host:'',has_smtp_pass:false};
 else if(p==='/api/admin/runtime')data={checkedAt:null,api:{startedAt:null,node:'v24'},worker:{state:'stopped',startedAt:null,checkedAt:null},deployment:{revision:null,completedAt:null,result:'none'},migrations:[],disk:null};
 else if(p==='/api/admin/analytics')data={summary:{},users:{active:0,disabled:0,deleted:0},popular:[],sources:[],trend:[],roles:[],identities:[],pages:[],referrers:[],devices:[],countries:[],start:'2026-11-01',end:'2026-11-04'};
 else if(p==='/api/article-drafts'&&r.request().method()==='POST'){const b=r.request().postDataJSON();data={id:b.id,locale:b.locale||'zh-CN',version:1,payload:{title:'',content:'',summary:'',slug:'',tags:[]},workflow:{state:'draft'}};}
 else if(p.startsWith('/api/article-drafts/'))data={id:'11111111-1111-4111-8111-111111111111',locale:'zh-CN',version:1,payload:{title:'',content:'',tags:[]},workflow:{state:'draft'}};
 return r.fulfill({json:data});});
 const source=await fs.readFile('src/app/RoutePages.tsx','utf8'),routes=[...new Set([...source.matchAll(/<Route path="([^"]+)"/g)].map(m=>m[1]))].map(x=>x.replace(':action','confirm').replace(':tag','qa').replace(':category','qa').replace(':slug','qa').replace(':id','1').replace('*','/qa-not-found'));
 try{for(mode of (process.env.QA_MODES||'empty,failure').split(','))for(current of routes.filter(route=>!process.env.QA_ROUTES||process.env.QA_ROUTES.split(',').includes(route))){errors=[];requests=[];page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4267'+current);await page.waitForTimeout(650);await page.waitForFunction(()=>document.documentElement.lang==='en',{},{timeout:5000}).catch(()=>{});
 const scan=await page.evaluate(()=>{const found=[];const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(walk.nextNode()){const n=walk.currentNode,e=n.parentElement;if(!e||['SCRIPT','STYLE'].includes(e.tagName)||!e.getClientRects().length)continue;const text=n.textContent.trim();if(/[\u3400-\u9fff]/.test(text))found.push(text)}for(const e of document.querySelectorAll('[aria-label],[placeholder],[title]'))if(e.getClientRects().length)for(const a of ['aria-label','placeholder','title']){const text=e.getAttribute(a);if(text&&/[\u3400-\u9fff]/.test(text))found.push(a+': '+text)}return {chinese:[...new Set(found)],overflow:document.documentElement.scrollWidth>innerWidth,title:document.title,textLength:document.body.innerText.length,language:document.documentElement.lang}});
 if(process.env.QA_VALIDATION&&current==='/login'){const field=page.locator('input[type=email]');await field.fill('invalid-address');const en=await field.evaluate(el=>{el.reportValidity();return el.validationMessage});if(!en||/[\u3400-\u9fff]/.test(en))throw Error('English validation failed: '+en);await chooseInterfaceLanguage(page,'zh-CN');await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');const zh=await field.evaluate(el=>{el.reportValidity();return el.validationMessage});if(!/[\u3400-\u9fff]/.test(zh)||await field.inputValue()!=='invalid-address')throw Error('Chinese validation or field retention failed');await fs.writeFile(out+'/validation.json',JSON.stringify({english:en,chinese:zh,inputPreserved:true},null,2));await chooseInterfaceLanguage(page,'en');}
 results.push({route:current,mode,url:page.url(),...scan,errors:[...errors],requests:[...new Set(requests)]});console.log(mode,current,'Chinese',scan.chinese.length,'errors',errors.length);await fs.writeFile(out+'/results.json',JSON.stringify(results,null,2));
 if(mode==='empty'&&['/about','/admin/blog-pages','/admin/users','/account/settings','/login','/early-access','/admin/festivals'].includes(current))for(const width of [1280,375])for(const theme of ['light','dark']){await page.setViewportSize({width,height:900});await page.evaluate(theme=>{document.documentElement.dataset.moonTheme=theme;document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.style.colorScheme=theme},theme);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);await fs.appendFile(out+'/visual-checks.jsonl',JSON.stringify({route:current,width,theme,overflow})+'\n');if(process.env.QA_STRICT&&overflow)throw Error('Horizontal overflow '+current+' '+width);await page.screenshot({path:out+'/'+current.replaceAll('/','_')+'-'+width+'-'+theme+'.png',fullPage:true,animations:'disabled'});}
 await Promise.race([page.close({runBeforeUnload:false}),new Promise(resolve=>setTimeout(resolve,1000))]);}
 }finally{await browser.close();await server.close()}
 if(process.env.QA_STRICT&&results.some(r=>r.chinese.length||r.errors.length||r.language!=='en'||!r.textLength))throw Error('Route language audit failed; inspect '+out+'/results.json');
 console.log('Route audit complete; results are observational and invalid fixtures are not passes.');
})().catch(e=>{console.error(e);process.exitCode=1});
