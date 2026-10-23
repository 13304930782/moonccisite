import {useState} from 'react';
import {Link2,UserRound} from 'lucide-react';
import {SitePage,PageHeading,ResourceState,useResource} from '../components/ContentUI';
import {EmptyState} from '../components/DetailUI';
import {AboutContent} from '../components/AboutContent';
import {safeHref,safeImageSrc} from '../lib/safeUrl';
import '../../styles/blog-foundation.css';
function Icon({src,profile=false}:{src?:string;profile?:boolean}){const [failed,setFailed]=useState(false);return safeImageSrc(src)&&!failed?<img className="blog-info-avatar" src={safeImageSrc(src)} alt="" onError={()=>setFailed(true)}/>:<span className="blog-info-avatar">{profile?<UserRound/>:<Link2/>}</span>;}
export function AboutPage(){const resource=useResource('/settings/blog-pages');const about=resource.data?.about;return <SitePage narrow className="about-page"><PageHeading eyebrow="ABOUT" title="关于我"/><ResourceState resource={resource}>{about?<AboutContent about={about}/>:<EmptyState>暂未公开个人介绍。</EmptyState>}</ResourceState></SitePage>;}
export function LinksPage(){const resource=useResource('/settings/blog-pages');const links=resource.data?.links||[];return <SitePage><PageHeading eyebrow="LINKS" title="友情链接"><p>值得访问的朋友们的网站。</p></PageHeading><ResourceState resource={resource}>{links.length?<div className="friend-grid">{links.map((l:any,i:number)=><a className="friend-link" key={`${l.url}-${i}`} href={safeHref(l.url)} target="_blank" rel="noopener noreferrer"><Icon src={l.icon}/><div><h2>{l.name} ↗</h2><p>{l.description}</p></div></a>)}</div>:<EmptyState>友链整理中。</EmptyState>}</ResourceState></SitePage>;}
