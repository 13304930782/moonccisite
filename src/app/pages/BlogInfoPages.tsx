import {useState} from 'react';
import {Link} from 'react-router-dom';
import {usePreviousSiteVisit} from '../components/RoutePosition';
import {SitePage,PageHeading,ResourceState,useResource} from '../components/ContentUI';
import {EmptyState} from '../components/DetailUI';
import {AboutContent} from '../components/AboutContent';
import {safeHref,safeImageSrc,safeRoutePath} from '../lib/safeUrl';
import '../../styles/blog-foundation.css';
function friendIcon(icon:string,href:string){
 if(icon.trim())return safeImageSrc(icon);
 try{const site=new URL(safeHref(href));return ['http:','https:'].includes(site.protocol)&&!site.username&&!site.password?`${site.origin}/favicon.ico`:'';}catch{return '';}
}
function Icon({src,name}:{src:string;name:string}){const [failed,setFailed]=useState('');return safeImageSrc(src)&&failed!==src?<img className="blog-info-avatar" src={safeImageSrc(src)} alt="" onError={()=>setFailed(src)}/>:<span className="blog-info-avatar" aria-hidden="true">{Array.from(name.trim()||'?')[0]}</span>;}

export function AboutPage(){const previous=usePreviousSiteVisit();const resource=useResource('/settings/blog-pages');const about=resource.data?.about;return <SitePage narrow className="about-page">{!safeRoutePath(previous?.path,'')&&<Link className="about-back-link" to="/">← 返回首页</Link>}<PageHeading eyebrow="ABOUT" title="关于我"/><ResourceState resource={resource}>{about?<AboutContent about={about}/>:<EmptyState>暂未公开个人介绍。</EmptyState>}</ResourceState></SitePage>;}
export function LinksPage(){const resource=useResource('/settings/blog-pages');const links=resource.data?.links||[];return <SitePage><PageHeading eyebrow="LINKS" title="友情链接"><p>值得访问的朋友们的网站。</p></PageHeading><ResourceState resource={resource}>{links.length?<div className="friend-grid">{links.map((l:any,i:number)=><a className="friend-link" key={`${l.url}-${i}`} href={safeHref(l.url)} target="_blank" rel="noopener noreferrer"><Icon src={friendIcon(l.icon,l.url)} name={l.name}/><div><h2>{l.name} ↗</h2><p>{l.description}</p></div></a>)}</div>:<EmptyState>友链整理中。</EmptyState>}</ResourceState></SitePage>;}
