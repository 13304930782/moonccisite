import { useI18n } from '../i18n';
import {useEffect,useRef,useState} from 'react';
import {MarkdownContent} from './MarkdownContent';
import {safeHref,safeImageSrc} from '../lib/safeUrl';
import '../../styles/about-page.css';
export const ABOUT_MODULE_KEYS = ['story','activities','technologies','timeline','social'] as const;
export type AboutModuleKey = typeof ABOUT_MODULE_KEYS[number];
export function getAboutModuleOrder(order?:readonly string[]):AboutModuleKey[]{
 return order?.length===ABOUT_MODULE_KEYS.length && new Set(order).size===ABOUT_MODULE_KEYS.length && order.every(key=>ABOUT_MODULE_KEYS.includes(key as AboutModuleKey)) ? [...order] as AboutModuleKey[] : [...ABOUT_MODULE_KEYS];
}
export type AboutData={moduleOrder?:AboutModuleKey[];enabled:boolean;name:string;intro:string;avatar:string;content:string;social:{name:string;url:string;enabled?:boolean}[];badges?:string[];technologies?:string[];activities?:{title:string;description:string;url:string;enabled?:boolean}[];timeline?:{date:string;description:string;enabled?:boolean}[];headings?:Partial<Record<'story'|'activities'|'technologies'|'timeline'|'social',string>>;sections?:Partial<Record<'story'|'activities'|'technologies'|'timeline'|'social',boolean>>};
function AboutTimeline({entries}:{entries:NonNullable<AboutData['timeline']>}){
 const ref=useRef<HTMLOListElement>(null);
 useEffect(()=>{
  const list=ref.current;if(!list||list.closest('.bp-preview'))return;
  let frame=0;
  const revealDistance=96;
  // Motion Prompt #145 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#145
  const update=()=>{frame=0;const rect=list.getBoundingClientRect(),absoluteTop=rect.top+window.scrollY,maxScroll=Math.max(0,document.documentElement.scrollHeight-window.innerHeight),start=Math.max(0,absoluteTop-window.innerHeight+42),end=Math.min(maxScroll,absoluteTop+rect.height+revealDistance-window.innerHeight+42),tip=end>start?(window.scrollY-start)/(end-start)*(rect.height+revealDistance):rect.height+revealDistance;
   list.style.setProperty('--timeline-fill',`${Math.max(0,Math.min(rect.height,tip))}px`);
   list.querySelectorAll<HTMLElement>('li').forEach(item=>{const dot=item.getBoundingClientRect().top-rect.top+14,t=Math.max(0,Math.min(1,(tip-dot)/revealDistance)),q=1-Math.pow(1-t,3);item.style.setProperty('--timeline-reveal',String(q));item.style.setProperty('--timeline-shift',`${16*(1-q)}px`);item.dataset.reached=String(q>0)});
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update)};
  list.dataset.animated='true';update();window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
  const resize=typeof ResizeObserver==='undefined'?null:new ResizeObserver(schedule);resize?.observe(list);
  return()=>{window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);resize?.disconnect();if(frame)cancelAnimationFrame(frame);delete list.dataset.animated};
 },[entries]);
 return <ol ref={ref} className="about-timeline">{entries.map((x,i)=><li key={i}><div className="about-timeline-copy"><small>{x.date}</small><p>{x.description}</p></div></li>)}</ol>;
}
export function AboutContent({about}:{about:AboutData}){
  const { t } = useI18n();
 const [failed,setFailed]=useState('');const visible=(key:keyof NonNullable<AboutData['sections']>)=>about.sections?.[key]!==false;
 const activities=(about.activities||[]).filter(x=>x.enabled!==false&&x.title.trim()),timeline=(about.timeline||[]).filter(x=>x.enabled!==false&&x.description.trim()),social=about.social.filter(x=>x.enabled!==false&&x.name.trim()&&safeHref(x.url));
 const technologies=(about.technologies||[]).filter(x=>x.trim());
 const name=about.name.trim(),initial=Array.from(name)[0]||'m';
 const modules={
  story: visible('story')&&about.content.trim()&&<section key="story" data-about-module="story"><h2 className="about-section-label">{about.headings?.story??t("m_5e175ace16")}</h2><MarkdownContent content={about.content} minHeadingLevel={2}/></section>,
  activities: visible('activities')&&activities.length>0&&<section key="activities" data-about-module="activities"><h2 className="about-section-label">{about.headings?.activities??t("m_ec07aceca0")}</h2><div className="about-activity-grid">{activities.map((x,i)=>{const body=<><strong>{x.title}</strong><span>{x.description}</span></>;return safeHref(x.url)?<a className="about-activity-card" href={safeHref(x.url)} key={i}>{body}</a>:<div className="about-activity-card" key={i}>{body}</div>;})}</div></section>,
  technologies: visible('technologies')&&technologies.length>0&&<section key="technologies" data-about-module="technologies"><h2 className="about-section-label">{about.headings?.technologies??t("m_637e19d92b")}</h2><div className="about-technologies">{technologies.map((x,i)=><span key={i}>{x}</span>)}</div></section>,
  timeline: visible('timeline')&&timeline.length>0&&<section key="timeline" data-about-module="timeline"><h2 className="about-section-label">{about.headings?.timeline??t("m_f1241a97b0")}</h2><AboutTimeline entries={timeline}/></section>,
  social: visible('social')&&social.length>0&&<section key="social" data-about-module="social"><h2 className="about-section-label">{about.headings?.social??t("m_3557d07255")}</h2><nav className="about-profile-links" aria-label={t("m_a19d092e8f")}>{social.map((x,i)=><a key={i} href={safeHref(x.url)} target="_blank" rel="noopener noreferrer">{x.name} ↗</a>)}</nav></section>,
 };
 return <div className="about-profile">
  <div className="about-profile-hero">{safeImageSrc(about.avatar)&&failed!==about.avatar?<img className="about-profile-avatar" src={safeImageSrc(about.avatar)} alt={t("m_57f3ae7f19", {v0: about.name})} onError={()=>setFailed(about.avatar)}/>:<span className="about-profile-avatar about-profile-initial" aria-hidden="true">{initial}</span>}<div>{name&&<h2>{name}</h2>}{about.intro&&<p>{about.intro}</p>}{!!about.badges?.length&&<div className="about-profile-badges">{about.badges.map((x,i)=><span key={i}>{x}</span>)}</div>}</div></div>
  {getAboutModuleOrder(about.moduleOrder).map(key=>modules[key])}
 </div>;
}
