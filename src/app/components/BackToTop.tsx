import {useEffect,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {ArrowUp} from 'lucide-react';
import {useLocale} from '../context/LocaleContext';
import {splitLocalePath} from '../lib/locale';
import {reducedMotion} from '../lib/motionPreference';
import '../../styles/back-to-top.css';
export default function BackToTop(){
 const {pathname}=useLocation(),{uiLocale}=useLocale();
 const [state,setState]=useState({visible:false,progress:0,article:false});
 useEffect(()=>{let frame=0;const update=()=>{frame=0;const node=document.querySelector<HTMLElement>('.article-presentation');const article=/^\/article\/[^/]+/.test(splitLocalePath(pathname).pathname)&&!!node;const rect=node?.getBoundingClientRect();const inArticle=!!(article&&rect&&rect.top<innerHeight&&rect.bottom>innerHeight*.5);const progress=rect?Math.max(0,Math.min(1,-rect.top/Math.max(1,rect.height-innerHeight))):0;setState({visible:scrollY>160,progress,article:inArticle});};const schedule=()=>{if(!frame)frame=requestAnimationFrame(update)};update();window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);return()=>{window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);cancelAnimationFrame(frame)};},[pathname]);
 const en=uiLocale==='en',label=en?'Back to top':'回到顶部';
 return <aside className="back-to-top" data-visible={state.visible} aria-hidden={!state.visible}><button type="button" tabIndex={state.visible?0:-1} aria-label={label} onClick={()=>window.scrollTo({top:0,behavior:reducedMotion()?'auto':'smooth'})}><ArrowUp size={24}/>{state.article&&<svg viewBox="0 0 80 80" className="back-to-top-ring" aria-hidden="true"><circle cx="40" cy="40" r="37" className="back-to-top-track"/><circle cx="40" cy="40" r="37" pathLength="100" className="back-to-top-progress" style={{strokeDashoffset:100*(1-state.progress)}}/></svg>}</button><span>{state.article?`${en?'Reading':'阅读'} ${Math.round(state.progress*100)}%`:label}</span></aside>;
}
