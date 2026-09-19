function text(v,max){const s=String(v??'').trim();if(s.length>max)throw Error('内容长度超出限制');return s;}
function url(v,image=false){const s=text(v,2048);if(!s)return '';if(/[\u0000-\u0020\\]/.test(s))throw Error('链接格式不正确');if(image&&/^\/(?!\/)/.test(s))return s;let u;try{u=new URL(s);}catch{throw Error('请输入完整的 HTTP(S) 链接');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('仅支持无账号密码的 HTTP(S) 链接');return u.href;}
function normalizePages(input){
 if(!input||typeof input!=='object'||!input.about||!Array.isArray(input.links))throw Error('配置格式不正确');
 const a=input.about;if(!Array.isArray(a.social)||a.social.length>20||input.links.length>100)throw Error('社交链接最多 20 条，友链最多 100 条');
 function link(v){const name=text(v.name,100),href=url(v.url);if(!name||!href)throw Error('请填写链接名称和地址');return {name,url:href,enabled:v.enabled!==false};}
 return {about:{enabled:a.enabled!==false,name:text(a.name,100),intro:text(a.intro,500),avatar:url(a.avatar,true),content:text(a.content,50000),social:a.social.map(link)},links:input.links.map(v=>({...link(v),description:text(v.description,500),icon:url(v.icon,true)}))};
}
function publicPages(value){return {about:value.about.enabled?{...value.about,social:value.about.social.filter(x=>x.enabled).map(({enabled,...x})=>x)}:null,links:value.links.filter(x=>x.enabled).map(({enabled,...x})=>x)};}
function attachBlogPages(router,{getSetting,saveSetting,authRequired,adminOnly,defaultProfile}){
 async function read(){const p=await getSetting('profile',defaultProfile);return getSetting('blog_pages',{about:{enabled:true,name:p.name||'',intro:p.bio||'',avatar:p.avatar_url||'',content:'',social:[['GitHub',p.github_url],['Twitter',p.twitter_url]].filter(([,u])=>/^https?:\/\//.test(u||'')).map(([name,url])=>({name,url,enabled:true}))},links:[]});}
 router.get('/blog-pages',async(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(publicPages(await read()));});
 router.get('/blog-pages/manage',authRequired,adminOnly,async(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(await read());});
 router.put('/blog-pages',authRequired,adminOnly,async(req,res)=>{let value;try{value=normalizePages(req.body);}catch(e){return res.status(400).json({message:e.message});}await saveSetting('blog_pages',value);res.json({message:'已保存',...value});});
}
module.exports={normalizePages,publicPages,attachBlogPages};
