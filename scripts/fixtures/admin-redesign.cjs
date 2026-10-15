const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const OUT=path.resolve('.cache/admin-redesign');
const now='2026-10-15T01:30:00.000Z',ID='a1111111-1111-4111-8111-111111111111';
const cover='<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#a3bed2"/><stop offset=".6" stop-color="#829e78"/><stop offset="1" stop-color="#b5a587"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/></svg>';
const empty={title:'',content:'',summary:'',cover_image:'',cover_crop:null,category:'',tags:[],slug:'',summary_mode:'manual',summary_receipt:''};
function createFixture(){
 const state={role:'owner',empty:false,paginated:false,slow:false,saveFail:false,publishFail:false,duplicateSlug:false,historyTotal:1,publishing:false,requests:[],saves:[],uploads:[],publishes:0,restores:0,imports:0,draft:null};
 state.posts=['Cities: Skylines II 都市天际线 2 进阶 Mod 推荐','pingu 论之「我不管 pingu 是我最爱的」','2024.11.13 C 语言——数组','2024.11.6 C 语言程序设计——循环','一次「慢 Cloudflare 验证」页面的分析记录','博客前端视觉重构和宿舍电量功能上线笔记','咕咕嘎嘎'].map((title,i)=>({id:i+1,title,summary:'记录使用方法与经验，让每一次更新都清晰可读。',category:i%2?'开发记录':'游戏',author_name:'mooncci',status:'published',updated_at:now,has_unpublished:i===0||i===1||i===3}));
 state.draft={id:ID,version:1,post_id:null,post_status:'draft',updated_at:now,dirty:1,payload:{...empty},workflow:{state:'draft'}};
 state.resetDraft=(payload={},extra={})=>{state.draft={id:ID,version:1,post_id:null,post_status:'draft',updated_at:now,dirty:1,payload:{...empty,...payload},workflow:{state:'draft'},...extra};};
 state.install=async page=>{
  await page.route('**/qa-cover.svg',r=>r.fulfill({contentType:'image/svg+xml',body:cover}));
  await page.route('**/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()),p=u.pathname,m=req.method(),record={path:p,method:m,query:u.search,body:m==='GET'?null:req.headers()['content-type']?.includes('json')?req.postDataJSON():null};state.requests.push(record);const send=(status,json)=>{record.status=status;return route.fulfill({status,json});};let body={};
   if(p==='/api/auth/session')body={user:{id:1,role:state.role,username:'mooncci',status:'active',can_comment:1}};
   else if(p==='/api/publishing/config')body={enabled:state.publishing};
   else if(p==='/api/account/security-config')body={enabled:false};
   else if(p==='/api/site-settings'||p==='/api/settings/site')body={brand:{site_name:'mooncci'},hero:{title:'记录与分享'},footer:{copyright:'mooncci'},weather:{enabled:false},weather_companion:{enabled:false}};
   else if(p==='/api/now')body={content:'记录日常',updated_at:now};
   else if(p==='/api/article-seo/status')body={enabled:true};
   else if(p==='/api/article-seo/generate')body={summary:'根据当前正文生成的测试简介，记录清晰的操作与实践经验。',summary_mode:'ai',summary_receipt:'a'.repeat(64)};
   else if(p==='/api/admin/posts'){
    if(state.slow)await new Promise(r=>setTimeout(r,500));
    let rows=state.empty?[]:state.posts.filter(x=>!['published','draft'].includes(u.searchParams.get('status'))||x.status===u.searchParams.get('status'));
    const page=Number(u.searchParams.get('page')||1);body={items:rows,total:state.paginated?51:rows.length,page,pageSize:50};
   }
   else if(p==='/api/article-drafts'&&m==='GET')body={items:[],total:0,page:1,pageSize:20};
   else if(p==='/api/article-drafts'&&m==='POST'){const data=req.postDataJSON();state.draft={...state.draft,id:data.id,post_id:data.post_id||null};body=state.draft;}
   else if(p==='/api/article-drafts/import'){state.imports++;body={draft_id:ID,image_count:1,warnings:['请核对导入后的排版。'],replayed:false};}
   else if(p.match(/\/article-drafts\/[^/]+\/revisions\/\d+\/restore$/)){
    assert.equal(req.postDataJSON().version,state.draft.version);state.restores++;state.draft={...state.draft,version:state.draft.version+1,dirty:1,published_version:null,payload:{...state.draft.payload,title:'恢复后的历史标题'}};body=state.draft;
   }
   else if(p.match(/\/article-drafts\/[^/]+\/revisions\/\d+$/))body={id:Number(p.split('/').at(-1)),kind:'manual',updated_at:now,payload:{...state.draft.payload,title:'恢复后的历史标题'}};
   else if(p.endsWith('/revisions')){const page=Number(u.searchParams.get('page')||1),all=Array.from({length:state.historyTotal},(_,i)=>({id:state.historyTotal-i,kind:'manual',actor_name:'mooncci',updated_at:now}));body={items:all.slice((page-1)*20,page*20),total:all.length,page,pageSize:20};}
   else if(p.endsWith('/publish')){state.publishes++;if(state.publishing&&!['owner','admin'].includes(state.role))return send(403,{message:'无权限发布。'});if(state.publishFail)return send(503,{message:'发布测试：服务暂时不可用'});if(state.duplicateSlug)return send(409,{message:'链接别名或草稿已存在，请重新加载后重试。'});assert.equal(req.postDataJSON().version,state.draft.version);state.draft={...state.draft,post_id:42,post_status:'published',dirty:0,published_version:state.draft.version,base_version:1};body=state.draft;}
   else if(p.endsWith('/submit')&&p.startsWith('/api/publishing/')){assert.equal(req.postDataJSON().version,state.draft.version);state.draft.workflow={state:'submitted',draft_version:state.draft.version};body={state:'submitted',draft_version:state.draft.version};}
   else if(p.startsWith('/api/article-drafts/')){
    if(m==='PUT'){const data=req.postDataJSON();state.saves.push(data);if(state.saveFail)return send(503,{message:'保存测试：服务暂时不可用'});const p=data.payload;if(String(p.title||'').length>255||String(p.slug||'').length>255||String(p.category||'').length>100||String(p.cover_image||'').length>500||String(p.content||'').length>500000||String(p.summary||'').length>10000)return send(400,{message:'内容超出长度限制。'});if(state.publishing&&['submitted','approved','scheduled'].includes(state.draft.workflow.state))return send(409,{message:'稿件已锁定。'});assert.equal(data.version,state.draft.version);const normalized={...p,tags:Array.isArray(p.tags)?p.tags.map(String).map(x=>x.trim()).filter(Boolean).slice(0,20):[],summary_receipt:/^[a-f0-9]{64}$/.test(p.summary_receipt||'')?p.summary_receipt:''};const changed=JSON.stringify(normalized)!==JSON.stringify(state.draft.payload);state.draft={...state.draft,version:state.draft.version+Number(changed),dirty:changed?1:state.draft.dirty,payload:normalized,updated_at:now};}
    body=state.draft;
   }
   else if(p==='/api/upload/image'){state.uploads.push(req.postData());body={url:'/qa-cover.svg'};}
   else if(p==='/api/upload/media')body={items:state.empty?[]:[{filename:'qa-cover.svg',display_name:'软件展示图',alt_text:'软件展示图',url:'/qa-cover.svg',size:1000,size_text:'1 KB',uploaded_at:now,width:1600,height:900,status:'active',ext:'.svg'}],total:state.empty?0:1,page:1,pageSize:50};
   else if(p==='/api/admin/comments')body={items:[{id:1,content:'这篇文章很有帮助。',post_title:'文章标题',author_name:'测试读者',status:'pending',created_at:now,ip_address_masked:'203.0.*.*'}],total:1,page:1,pageSize:50};
   else if(p==='/api/admin/users')body={items:[{id:2,username:'测试读者',email:'reader@example.test',role:'user',status:'active',can_comment:1,created_at:now}],total:1,page:1,pageSize:50};
   else if(p==='/api/admin/stats')body={posts:7,users:2,comments:1,bannedWords:0};
   await send(200,body);
  });
 };
 return state;
}
async function launch(){return chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});}
module.exports={createFixture,launch,OUT,ID,now};
