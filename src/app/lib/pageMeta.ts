export function applyPageMeta(meta:any){
 document.title=meta.title;
 document.head.querySelectorAll('meta[name="description"],meta[name="robots"],meta[property^="og:"],meta[property^="article:"],link[rel="canonical"],script#article-jsonld').forEach(el=>el.remove());
 for(const [key,value] of Object.entries({description:meta.description,robots:meta.robots,'og:title':meta.title,'og:description':meta.description,'og:url':meta.canonical,'og:image':meta.image,'og:type':meta.type,'og:site_name':meta.siteName,'article:published_time':meta.published,'article:modified_time':meta.modified})){if(!value)continue;const el=document.createElement('meta');el.setAttribute(key.includes(':')?'property':'name',key);el.content=String(value);document.head.appendChild(el);}
 if(meta.canonical){const el=document.createElement('link');el.rel='canonical';el.href=meta.canonical;document.head.appendChild(el);}
 if(meta.jsonLd){const el=document.createElement('script');el.type='application/ld+json';el.id='article-jsonld';el.textContent=JSON.stringify(meta.jsonLd);document.head.appendChild(el);}
}
