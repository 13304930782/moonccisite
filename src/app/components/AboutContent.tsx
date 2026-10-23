import {useState} from 'react';
import {MarkdownContent} from './MarkdownContent';
import {safeHref,safeImageSrc} from '../lib/safeUrl';
import '../../styles/about-page.css';
export const ABOUT_MODULE_KEYS = ['story','activities','technologies','timeline','social'] as const;
export type AboutModuleKey = typeof ABOUT_MODULE_KEYS[number];
export function getAboutModuleOrder(order?:readonly string[]):AboutModuleKey[]{
 return order?.length===ABOUT_MODULE_KEYS.length && new Set(order).size===ABOUT_MODULE_KEYS.length && order.every(key=>ABOUT_MODULE_KEYS.includes(key as AboutModuleKey)) ? [...order] as AboutModuleKey[] : [...ABOUT_MODULE_KEYS];
}
export type AboutData={moduleOrder?:AboutModuleKey[];enabled:boolean;name:string;intro:string;avatar:string;content:string;social:{name:string;url:string;enabled?:boolean}[];badges?:string[];technologies?:string[];activities?:{title:string;description:string;url:string;enabled?:boolean}[];timeline?:{date:string;description:string;enabled?:boolean}[];headings?:Partial<Record<'story'|'activities'|'technologies'|'timeline'|'social',string>>;sections?:Partial<Record<'story'|'activities'|'technologies'|'timeline'|'social',boolean>>};
export function AboutContent({about}:{about:AboutData}){
 const [failed,setFailed]=useState('');const visible=(key:keyof NonNullable<AboutData['sections']>)=>about.sections?.[key]!==false;
 const activities=(about.activities||[]).filter(x=>x.enabled!==false&&x.title.trim()),timeline=(about.timeline||[]).filter(x=>x.enabled!==false&&x.description.trim()),social=about.social.filter(x=>x.enabled!==false&&x.name.trim()&&safeHref(x.url));
 const technologies=(about.technologies||[]).filter(x=>x.trim());
 const name=about.name.trim(),initial=Array.from(name)[0]||'m';
 const modules={
  story: visible('story')&&about.content.trim()&&<section key="story" data-about-module="story"><h2 className="about-section-label">{about.headings?.story??'关于这个博客'}</h2><MarkdownContent content={about.content} minHeadingLevel={2}/></section>,
  activities: visible('activities')&&activities.length>0&&<section key="activities" data-about-module="activities"><h2 className="about-section-label">{about.headings?.activities??'我在做什么'}</h2><div className="about-activity-grid">{activities.map((x,i)=>{const body=<><strong>{x.title}</strong><span>{x.description}</span></>;return safeHref(x.url)?<a className="about-activity-card" href={safeHref(x.url)} key={i}>{body}</a>:<div className="about-activity-card" key={i}>{body}</div>;})}</div></section>,
  technologies: visible('technologies')&&technologies.length>0&&<section key="technologies" data-about-module="technologies"><h2 className="about-section-label">{about.headings?.technologies??'常用技术'}</h2><div className="about-technologies">{technologies.map((x,i)=><span key={i}>{x}</span>)}</div></section>,
  timeline: visible('timeline')&&timeline.length>0&&<section key="timeline" data-about-module="timeline"><h2 className="about-section-label">{about.headings?.timeline??'时间线'}</h2><ol className="about-timeline">{timeline.map((x,i)=><li key={i}><small>{x.date}</small><p>{x.description}</p></li>)}</ol></section>,
  social: visible('social')&&social.length>0&&<section key="social" data-about-module="social"><h2 className="about-section-label">{about.headings?.social??'找到我'}</h2><nav className="about-profile-links" aria-label="社交链接">{social.map((x,i)=><a key={i} href={safeHref(x.url)} target="_blank" rel="noopener noreferrer">{x.name} ↗</a>)}</nav></section>,
 };
 return <div className="about-profile">
  <div className="about-profile-hero">{safeImageSrc(about.avatar)&&failed!==about.avatar?<img className="about-profile-avatar" src={safeImageSrc(about.avatar)} alt={`${about.name}的头像`} onError={()=>setFailed(about.avatar)}/>:<span className="about-profile-avatar about-profile-initial" aria-hidden="true">{initial}</span>}<div>{name&&<h2>{name}</h2>}{about.intro&&<p>{about.intro}</p>}{!!about.badges?.length&&<div className="about-profile-badges">{about.badges.map((x,i)=><span key={i}>{x}</span>)}</div>}</div></div>
  {getAboutModuleOrder(about.moduleOrder).map(key=>modules[key])}
 </div>;
}
