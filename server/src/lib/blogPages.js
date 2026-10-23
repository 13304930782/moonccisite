function text(v,max){const s=String(v??'').trim();if(s.length>max)throw Error('内容长度超出限制');return s;}
function url(v,image=false){const s=text(v,2048);if(!s)return '';if(/[\u0000-\u0020\\]/.test(s))throw Error('链接格式不正确');if(image&&/^\/(?!\/)/.test(s))return s;let u;try{u=new URL(s);}catch{throw Error('请输入完整的 HTTP(S) 链接');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('仅支持无账号密码的 HTTP(S) 链接');return u.href;}
function aboutExtras(a){
 function list(key,max,convert){const values=a[key]??[];if(!Array.isArray(values)||values.length>max)throw Error(`${key} 数量超出限制`);return values.map(convert);}
 function label(v){const value=text(v,60);if(!value)throw Error('请填写标签');return value;}
 return {headings:Object.fromEntries(Object.entries({story:'关于这个博客',activities:'我在做什么',technologies:'常用技术',timeline:'时间线',social:'找到我'}).map(([key,fallback])=>[key,text(a.headings?.[key]??fallback,60)])),badges:list('badges',8,label),technologies:list('technologies',30,label),activities:list('activities',12,v=>{if(!v||typeof v!=='object')throw Error('近况格式不正确');const title=text(v.title,100);if(!title)throw Error('请填写近况标题');return {title,description:text(v.description,500),url:url(v.url,true),enabled:v.enabled!==false};}),timeline:list('timeline',30,v=>{if(!v||typeof v!=='object')throw Error('时间线格式不正确');const date=text(v.date,60),description=text(v.description,500);if(!date||!description)throw Error('请填写时间和经历');return {date,description,enabled:v.enabled!==false};}),sections:Object.fromEntries(['story','activities','technologies','timeline','social'].map(key=>[key,a.sections?.[key]!==false]))};
}
function normalizePages(input){
 if(!input||typeof input!=='object'||!input.about||!Array.isArray(input.links))throw Error('配置格式不正确');
 const a=input.about;if(!Array.isArray(a.social)||a.social.length>20||input.links.length>100)throw Error('社交链接最多 20 条，友链最多 100 条');
 function link(v,mail=false){const name=text(v.name,100),raw=text(v.url,2048),href=mail&&/^mailto:[^\s?/#:]+@[^\s?/#:]+$/.test(raw)?raw:url(raw);if(!name||!href)throw Error('请填写链接名称和地址');return {name,url:href,enabled:v.enabled!==false};}
 return {about:{enabled:a.enabled!==false,name:text(a.name,100),intro:text(a.intro,500),avatar:url(a.avatar,true),content:text(a.content,50000),social:a.social.map(v=>link(v,true)),...aboutExtras(a)},links:input.links.map(v=>({...link(v),description:text(v.description,500),icon:url(v.icon,true)}))};
}
function publicPages(value){
 const extra=aboutExtras(value.about),sections=extra.sections;
 const rows=(key)=>sections[key]?extra[key].filter(x=>x.enabled).map(({enabled,...x})=>x):[];
 return {about:value.about.enabled?{...value.about,...extra,content:sections.story?value.about.content:'',technologies:sections.technologies?extra.technologies:[],activities:rows('activities'),timeline:rows('timeline'),social:sections.social?value.about.social.filter(x=>x.enabled).map(({enabled,...x})=>x):[]}:null,links:value.links.filter(x=>x.enabled).map(({enabled,...x})=>x)};
}
function attachBlogPages(router,{getSetting,saveSetting,authRequired,adminOnly,defaultProfile}){
 async function read(){const p=await getSetting('profile',defaultProfile);const value=await getSetting('blog_pages',{about:{enabled:true,name:p.name||'',intro:p.bio||'',avatar:p.avatar_url||'',content:'',social:[['GitHub',p.github_url],['Twitter',p.twitter_url]].filter(([,u])=>/^https?:\/\//.test(u||'')).map(([name,url])=>({name,url,enabled:true}))},links:[]});return {...value,about:{...value.about,...aboutExtras(value.about)}};}
 router.get('/blog-pages',async(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(publicPages(await read()));});
 router.get('/blog-pages/manage',authRequired,adminOnly,async(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(await read());});
 router.put('/blog-pages',authRequired,adminOnly,async(req,res)=>{let value;try{const previous=await read();value=normalizePages({...req.body,about:{...previous.about,...req.body?.about}});}catch(e){return res.status(400).json({message:e.message});}await saveSetting('blog_pages',value);res.json({message:'已保存',...value});});
}
module.exports={normalizePages,publicPages,attachBlogPages};
