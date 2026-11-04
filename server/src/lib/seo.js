const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function plain(value){return String(value||'').replace(/^\s*(?:>\s*)?(?:\*\*)?提醒[：:]\s*本文最后更新于\s*[\d\s/:年月日-]+[，,]\s*文中所关联的信息可能已发生改变[，,]\s*请知悉[！!。.]?(?:\*\*)?\s*/u,'').replace(/```[\s\S]*?```/g,' ').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<[^>]*>/g,' ').replace(/[#*_>`~]/g,'').replace(/\s+/g,' ').trim();}
function origin(){const u=new URL(process.env.SITE_URL||'https://mooncci.site');if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Invalid SITE_URL');return u.origin;}
function imageUrl(value,base=origin(),fallback='/default-share.png'){if(!value&&!fallback)return '';try{const u=new URL(String(value||fallback),base);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)return u.href;}catch{}return fallback?base+fallback:'';}
const descriptions={
 '/':'mooncci 的个人技术博客，记录软件开发、网络与服务器实践，分享技术文章、日常近况以及持续构建的作品。可以按分类、标签或归档浏览文章，也可以通过 RSS 订阅最近更新。',
 '/articles':'阅读 mooncci 发布的技术文章与实践记录，了解软件开发、网络配置、服务器维护和项目经验。按分类或标签筛选感兴趣的主题，进入文章查看正文与相关内容。',
 '/archives':'按发布时间浏览 mooncci 的文章归档，回顾不同时期的技术实践与经验记录。从归档列表进入文章，查看完整正文，也可以通过分类和标签继续寻找相关主题。',
 '/about':'了解 mooncci 与这个个人技术博客，阅读作者介绍、博客背景和公开的社交链接。这里记录技术探索、日常近况与作品进展，方便读者了解文章和项目背后的作者。',
 '/links':'浏览 mooncci 的友情链接，发现朋友们的网站与个人博客。查看每个网站的名称和简介，访问感兴趣的链接，探索更多作者的文章、作品与日常记录。',
 '/projects':'浏览 mooncci 持续构建和维护的作品、工具与实验项目。进入作品详情了解项目介绍、功能与版本进展，查看相关链接，跟进项目的后续更新。',
 '/updates':'查看 mooncci 最近发布的文章、日常近况与作品版本更新。按内容类型筛选动态，进入文章或作品了解详情，也可以通过 RSS 持续跟进博客的新内容。',
 '/tags':'浏览 mooncci 技术博客的文章标签，从感兴趣的主题寻找相关内容。进入标签页查看对应文章，阅读完整正文，或结合分类和归档继续探索相关实践记录。',
 '/categories':'按分类浏览 mooncci 的技术文章与实践记录，找到感兴趣的内容方向。进入分类页查看文章列表，阅读完整正文，并通过标签和归档探索更多相关主题。',
 '/rss':'通过 RSS 订阅 mooncci 的最新文章、日常近况与作品进展。查看订阅源地址，将它添加到喜欢的 RSS 阅读器中，持续获取博客更新并返回网站阅读详情。',
 '/series':'浏览 mooncci 的文章专栏，按相关主题连续阅读技术文章与实践记录。进入专栏查看介绍和文章目录，了解各篇文章之间的联系，逐步跟进完整主题。',
 '/early-access':'了解 PromptDock 的产品介绍与抢先体验计划，查看体验相关说明并提交申请。申请通过后按照通知获取体验内容，跟进这款作品的功能与版本进展。',
 '/mail-setup':'查看 mooncci 邮箱的 IMAP、SMTP 服务器、端口和加密设置，了解如何在邮件客户端中配置收发信。按页面说明填写账号信息，并使用提供的配置方式完成设置。'
};
const titles={'/':'个人技术博客与开发实践','/articles':'文章 · 技术实践与经验记录','/archives':'文章归档 · 按时间浏览','/about':'关于我 · 作者与博客介绍','/links':'友情链接 · 朋友们的网站','/projects':'作品 · 工具与实验项目','/updates':'近况 · 文章与作品更新','/tags':'文章标签 · 按主题浏览','/categories':'文章分类 · 按方向浏览','/rss':'RSS 订阅 · 获取最近更新','/series':'文章专栏 · 连续阅读','/early-access':'PromptDock 抢先体验','/mail-setup':'邮箱客户端配置 · IMAP 与 SMTP'};
const englishTitles={'/':'Personal technology blog','/articles':'Articles · Notes and practical guides','/archives':'Article archive','/about':'About me','/links':'Friends and links','/projects':'Projects and experiments','/updates':'Latest updates','/tags':'Article tags','/categories':'Article categories','/rss':'RSS subscriptions','/series':'Article series','/early-access':'PromptDock early access','/mail-setup':'Email client setup · IMAP and SMTP'};
const englishDescriptions={
 '/':'Personal notes by mooncci on software development, networks and servers, alongside recent updates and projects. Browse articles by category, tag or date, or follow the RSS feed.',
 '/articles':'Read practical notes and guides by mooncci on software development, networks, servers and projects. Explore related topics by category and tag.',
 '/archives':'Browse articles by publication date and revisit earlier technical projects and practical notes.',
 '/about':'Meet mooncci and learn about this personal technology blog, current projects and public social links.',
 '/links':'Explore friends’ websites and personal blogs, with introductions and links to their writing and projects.',
 '/projects':'Explore tools, experiments and projects built by mooncci. Read project introductions and follow their releases.',
 '/updates':'Follow recent articles, personal updates and project releases from mooncci, or subscribe through RSS.',
 '/tags':'Explore articles by topic and find practical notes related to your interests.',
 '/categories':'Browse technology articles by category and discover related guides, projects and practical notes.',
 '/rss':'Subscribe to new articles, personal updates and project releases with your preferred RSS reader.',
 '/series':'Read related articles in a series and follow a topic through its connected guides and practical notes.',
 '/early-access':'Learn about PromptDock and its early access programme, review the details and apply to try it.',
 '/mail-setup':'Configure a mail client with the IMAP and SMTP server addresses, ports and encryption settings for mooncci email.'
};
function localizedPath(path,locale){return locale==='en'?(path==='/'?'/en':'/en'+path):path;}
function alternateLinks(path,locales=['zh-CN','en']){return [...locales.map(locale=>({locale,href:origin()+localizedPath(path,locale)})),{locale:'x-default',href:origin()+path}];}
function localizeMeta(meta,path,locale='zh-CN'){
 const result={...meta,locale,canonical:origin()+localizedPath(path,locale)};
 if(locale==='en'){
  if(englishTitles[path])result.title=path==='/'?`${meta.siteName} · ${englishTitles[path]}`:`${englishTitles[path]} · ${meta.siteName}`;
  if(englishDescriptions[path])result.description=englishDescriptions[path];
 }
 if(titles[path] && meta.robots==='index, follow')result.alternates=alternateLinks(path);
 return result;
}
// Prefer real content over padding a short summary with generic SEO text.
function contentDescription(summary,content){
 const lead=plain(summary),body=plain(content);
 if(Array.from(lead).length>=25||!body)return Array.from(lead).slice(0,160).join('');
 if(!lead||body.startsWith(lead))return body.slice(0,160);
 return `${lead} ${body}`.slice(0,160);
}
function baseMeta(path,brand={}){const name=String(brand.site_title||'mooncci');const publicDetail=/^\/(projects|updates|category|tag)\/[^/]+$/.test(path);return {title:path === '/' ? name : `${titles[path]||'页面'} · ${name}`,description:descriptions[path]||'记录文章、日常近况与作品进展。',canonical:origin()+path,siteName:name,image:imageUrl(brand.share_image_url),favicon:imageUrl(brand.favicon_url,origin(),''),type:'website',robots:titles[path]||publicDetail?'index, follow':'noindex, follow',jsonLd:null};}
function iso(value){const d=new Date(value);return value&&Number.isFinite(d.getTime())?d.toISOString():undefined;}
function articleMeta(post,brand={}){const path=require('./articleSlug').articlePath(post);const locale=post.content_locale||'zh-CN';const m=localizeMeta(baseMeta(path,brand),path,locale);m.alternates=alternateLinks(path,post.available_locales||['zh-CN']);const published=iso(post.published_at||post.created_at),modified=iso(post.updated_at||post.published_at||post.created_at);return {...m,title:`${post.title} · ${m.siteName}`,description:contentDescription(post.summary,post.content),image:imageUrl(post.cover_image||brand.share_image_url),type:'article',robots:'index, follow',published,modified,jsonLd:{'@context':'https://schema.org','@type':'BlogPosting',inLanguage:locale,headline:post.title,description:contentDescription(post.summary,post.content),image:[imageUrl(post.cover_image||brand.share_image_url)],datePublished:published,dateModified:modified,author:{'@type':'Person',name:post.author_name||m.siteName},mainEntityOfPage:m.canonical,url:m.canonical}};}
function updateMeta(update,brand={}){const path=`/updates/${update.id}`;const m=localizeMeta(baseMeta(path,brand),path,update.content_locale);m.alternates=alternateLinks(path,update.available_locales||['zh-CN']);const description=plain(update.content).slice(0,160);return {...m,title:`${description.slice(0,48)||'近况'} · ${m.siteName}`,description:description||'mooncci 的近况。',image:imageUrl(update.image_url||brand.share_image_url),robots:'index, follow'};}
function projectMeta(project,brand={}){const path=`/projects/${encodeURIComponent(project.slug)}`;const m=localizeMeta(baseMeta(path,brand),path,project.content_locale);m.alternates=alternateLinks(path,project.available_locales||['zh-CN']);return {...m,title:`${project.name} · ${m.siteName}`,description:contentDescription(project.summary,project.content),image:imageUrl(project.cover_image||brand.share_image_url),robots:'index, follow'};}
function categoryMeta(category,brand={}){const m=baseMeta(`/category/${encodeURIComponent(category)}`,brand);return {...m,title:`${category} · 分类 · ${m.siteName}`,description:`阅读 ${m.siteName} 的「${category}」分类文章与实践记录，浏览这一方向的相关主题、经验和项目介绍。进入文章查看完整正文，或通过标签和归档继续查找感兴趣的内容。`,robots:'index, follow'};}
function renderHtml(template,meta){
 // Keep a boundary so removing old metadata cannot join fragments into a new tag.
 const clean=template.replace(/<title[^>]*>[\s\S]*?<\/title>/gi,'\n').replace(/<meta\b(?=[^>]*(?:name=["'](?:description|robots|twitter:[^"']+)["']|property=["'](?:og:[^"']+|article:[^"']+)["']))[^>]*>/gi,'\n').replace(/<link\b(?=[^>]*rel=["'](?:canonical|alternate|icon|shortcut icon)["'])[^>]*>/gi,'\n').replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,'\n');
 const tags=[`<title>${escape(meta.title)}</title>`,`<meta name="description" content="${escape(meta.description)}">`,`<meta name="robots" content="${escape(meta.robots)}">`,`<link rel="canonical" href="${escape(meta.canonical)}">`,...Object.entries({'og:title':meta.title,'og:description':meta.description,'og:url':meta.canonical,'og:image':meta.image,'og:type':meta.type,'og:locale':meta.locale==='en'?'en_US':'zh_CN','og:site_name':meta.siteName,'article:published_time':meta.published,'article:modified_time':meta.modified}).filter(([,v])=>v).map(([k,v])=>`<meta property="${k}" content="${escape(v)}">`)];
 for(const alternate of meta.alternates||[])tags.push(`<link rel="alternate" hreflang="${escape(alternate.locale)}" href="${escape(alternate.href)}">`);
 if(meta.favicon)tags.push(`<link rel="icon" href="${escape(meta.favicon)}">`);
 for(const [key,value] of Object.entries({'twitter:card':'summary_large_image','twitter:title':meta.title,'twitter:description':meta.description,'twitter:image':meta.image})) tags.push(`<meta name="${key}" content="${escape(value)}">`);
 if(meta.jsonLd)tags.push(`<script id="article-jsonld" type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')}</script>`);
 return clean.replace(/<html\b[^>]*>/i,tag=>tag.replace(/\s+lang=["'][^"']*["']/i,'').replace(/>$/,` lang="${meta.locale==='en'?'en':'zh-CN'}">`)).replace('</head>',tags.join('\n')+'\n</head>');
}
function sitemap(rows){return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+rows.map(r=>`<url><loc>${escape(origin()+r.path)}</loc>${iso(r.updated_at)?`<lastmod>${iso(r.updated_at)}</lastmod>`:''}</url>`).join('')+'</urlset>';}
module.exports={escape,plain,origin,baseMeta,articleMeta,updateMeta,projectMeta,categoryMeta,renderHtml,sitemap,titles,contentDescription,localizeMeta,localizedPath,alternateLinks};
