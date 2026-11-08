import { useI18n } from '../i18n';
import {useState} from 'react';

import {SitePage,PageHeading,ResourceState,useResource} from '../components/ContentUI';
import {EmptyState} from '../components/DetailUI';
import {AboutContent} from '../components/AboutContent';
import {safeHref,safeImageSrc} from '../lib/safeUrl';
import '../../styles/blog-foundation.css';
function friendIcon(icon:string,href:string){
 if(icon.trim())return safeImageSrc(icon);
 try{const site=new URL(safeHref(href));return ['http:','https:'].includes(site.protocol)&&!site.username&&!site.password?`${site.origin}/favicon.ico`:'';}catch{return '';}
}
function Icon({src,name}:{src:string;name:string}){const [failed,setFailed]=useState('');return safeImageSrc(src)&&failed!==src?<img className="blog-info-avatar" src={safeImageSrc(src)} alt="" onError={()=>setFailed(src)}/>:<span className="blog-info-avatar" aria-hidden="true">{Array.from(name.trim()||'?')[0]}</span>;}

export function AboutPage(){
  const { t } = useI18n();const resource=useResource('/settings/blog-pages');const about=resource.data?.about;return <SitePage narrow className="about-page"><PageHeading eyebrow="ABOUT" title={t("m_89ae6c0fdf")}/><ResourceState resource={resource}>{about?<AboutContent about={about}/>:<EmptyState>{t("m_f4287c1dbf")}</EmptyState>}</ResourceState></SitePage>;}
export function LinksPage(){
  const { t } = useI18n();const resource=useResource('/settings/blog-pages');const links=resource.data?.links||[];return <SitePage><PageHeading eyebrow="LINKS" title={t("m_c2a2f8293d")}><p>{t("m_5a03f65691")}</p></PageHeading><ResourceState resource={resource}>{links.length?<div className="friend-grid">{links.map((l:any,i:number)=><a className="friend-link" key={`${l.url}-${i}`} href={safeHref(l.url)} target="_blank" rel="noopener noreferrer"><Icon src={friendIcon(l.icon,l.url)} name={l.name}/><div><h2>{l.name} ↗</h2><p>{l.description}</p></div></a>)}</div>:<EmptyState>{t("m_8f26345d6a")}</EmptyState>}</ResourceState></SitePage>;}
