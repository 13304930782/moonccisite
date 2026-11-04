export function applyPageMeta(meta:any){
 document.title=meta.title;
 if(meta.locale)document.documentElement.lang=meta.locale;
 document.head.querySelectorAll('meta[name="description"],meta[name="robots"],meta[name^="twitter:"],meta[property^="og:"],meta[property^="article:"],link[rel="canonical"],script#article-jsonld,link[rel="alternate"][hreflang]').forEach(el=>el.remove());
 for(const [key,value] of Object.entries({description:meta.description,robots:meta.robots,'twitter:card':'summary_large_image','twitter:title':meta.title,'twitter:description':meta.description,'twitter:image':meta.image,'og:title':meta.title,'og:description':meta.description,'og:url':meta.canonical,'og:image':meta.image,'og:type':meta.type,'og:locale':meta.locale==='en'?'en_US':'zh_CN','og:site_name':meta.siteName,'article:published_time':meta.published,'article:modified_time':meta.modified})){if(!value)continue;const el=document.createElement('meta');el.setAttribute(key.startsWith('og:')||key.startsWith('article:')?'property':'name',key);el.content=String(value);document.head.appendChild(el);}
 if(meta.canonical){const el=document.createElement('link');el.rel='canonical';el.href=meta.canonical;document.head.appendChild(el);}
 for(const alternate of meta.alternates||[]){const el=document.createElement('link');el.rel='alternate';el.hreflang=alternate.locale;el.href=alternate.href;document.head.appendChild(el);}
 if(meta.jsonLd){const el=document.createElement('script');el.type='application/ld+json';el.id='article-jsonld';el.textContent=JSON.stringify(meta.jsonLd);document.head.appendChild(el);}
}
