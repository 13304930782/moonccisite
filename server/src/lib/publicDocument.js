const path = require('node:path');
const fs = require('node:fs/promises');
const {pathToFileURL} = require('node:url');
const publicRoutes = /^\/(?:|articles|archives|about|links|projects|updates|tags|categories|rss|series|early-access|mail-setup|article\/[^/]+|updates\/[^/]+|projects\/[^/]+|category\/[^/]+|tag\/[^/]+|series\/[^/]+)$/;
const privateRoutes = /^\/(?:admin(?:\/.*)?|account(?:\/.*)?|login|admin-login|register|forgot-password|reset-password|complete-registration|subscription\/[^/]+|search|diagnostics|electricity)$/;
const endpoints = /^\/(?:settings\/(?:site|blog-pages)|publishing\/config|subscriptions\/status|now|activity|projects(?:\/[A-Za-z0-9_-]+)?|updates\/[1-9]\d*|posts(?:\/(?:[1-9]\d*(?:\/discovery)?|archives|meta\/(?:categories|tags)))?|series(?:\/[^/?]+)?)$/;
const allowedQuery = new Set(['page','pageSize','format','category','tag','type','featured','release']);
function isPublicResource(value) {
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  const url = new URL(value,'http://local');
  return endpoints.test(url.pathname) && [...url.searchParams.keys()].every(key=>allowedQuery.has(key));
}
async function loadPublicResource(value,clientIp) {
  if(!isPublicResource(value)) throw Error('Unexpected document resource');
  // Fixed loopback origin; no visitor cookies, Authorization, Host or arbitrary destination.
  const response = await fetch(`http://127.0.0.1:${Number(process.env.PORT)||3001}/api${value}`, {signal:AbortSignal.timeout(8000),redirect:'error',headers:require('node:net').isIP(clientIp||'')?{'X-Forwarded-For':clientIp}:{}});
  if(!response.ok) throw Object.assign(Error('Public document resource unavailable'),{status:response.status});
  const result=await response.json();
  if(/^\/posts\/\d+$/.test(value) && result.status!=='published') throw Object.assign(Error('Unpublished document'),{status:404});
  return result;
}
let runtime;
async function renderDocument(url, loader=loadPublicResource,status=200) {
  runtime ||= import(pathToFileURL(path.resolve(__dirname,'../../runtime/document.mjs')).href).catch(error=>{runtime=null;throw error;});
  return (await runtime).renderDocument(url,loader,status);
}
function serialize(value) { return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')); }
async function injectDocument(template, rendered) {
  const start=template.indexOf('<div id="root">'), script=template.indexOf('<script',start);
  if(start<0||script<0) throw Error('Document root missing');
  const assets=JSON.parse(await fs.readFile(path.resolve(__dirname,'../../runtime/styles.json'),'utf8'));
  const pathname=new URL(rendered.data.url||'/','http://local').pathname;
  const routes={'/articles':'ArticlesPage','/article':'ArticlePage','/archives':'ArchivesPage','/about':'BlogInfoPages','/links':'BlogInfoPages','/projects':'ProjectsPage','/updates':'UpdatesPage','/tags':'TagsPage','/tag':'TagPage','/categories':'CategoriesPage','/category':'CategoryPage','/series':'SeriesPage','/early-access':'EarlyAccessPage','/mail-setup':'MailSetupPage','/rss':'RssPage'};
  const name=rendered.data.status===404?'NotFoundPage':routes['/'+pathname.split('/')[1]]||'index';
  const selected=[assets[name],...(pathname==='/' && rendered.data.resources?.['/now']?.content?.trim()?[assets.MarkdownContent]:[])].filter(Boolean);
  const css=[...new Set(selected.flatMap(x=>x.css))].filter(url=>!template.includes(url));
  const js=[...new Set(selected.flatMap(x=>x.js))].filter(url=>!template.includes(url));
  return (template.slice(0,start).replace(/<html\b/, '<html data-document-hydrating="true"')+`<div id="root">${rendered.html}</div>\n<script id="mooncci-document-data" type="application/json">${serialize(rendered.data)}</script>\n`+template.slice(script))
    .replace('</head>',css.map(url=>`<link rel="stylesheet" href="${url}">`).join('')+js.map(url=>`<link rel="modulepreload" href="${url}">`).join('')+'</head>');
}
module.exports={publicRoutes,privateRoutes,isPublicResource,loadPublicResource,renderDocument,injectDocument,serialize};
