import { LanguageSwitch } from './LanguageSwitch';
import { useI18n } from '../i18n';
import {useOperations} from '../lib/useOperations';
import '../../styles/workspace-polish.css';
import {NavLink,useNavigate} from 'react-router-dom';
import {Link} from './LocaleLink';
import {useEffect,useState} from 'react';
import {useEngagement} from '../lib/useEngagement';
import {api} from '../lib/api';
import type {ReactNode} from 'react';
import {ArrowUpRight,UserRound,Bookmark,FilePenLine,LogOut,Bell,History,LayoutDashboard,Mail} from 'lucide-react';
import {usePublishing} from '../lib/usePublishing';
import {useAuth} from '../context/AuthContext';
import {ThemeToggle} from '../context/ThemeContext';
import '../../styles/publishing.css';
import '../../styles/account-workspace.css';
import '../../styles/engagement.css';
export function AccountWorkspace({children}:{children:ReactNode}){
  const { t } = useI18n();
 const enabled=usePublishing(),{user,logout,loggingOut,logoutError}=useAuth(),navigate=useNavigate();
 const operations=useOperations();
 const engagement=useEngagement(),[unread,setUnread]=useState(0);
 useEffect(()=>{if(!engagement)return;const poll=()=>{if(document.visibilityState==='visible')api('/engagement/notifications/unread').then(r=>setUnread(r.unread)).catch(()=>{});};poll();const timer=setInterval(poll,60000);document.addEventListener('visibilitychange',poll);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',poll);};},[engagement]);
 return <div className="account-shell">
 <header className="account-topbar"><div className="account-topbar-inner"><div className="account-brand"><Link to="/" className="site-brand">mooncci</Link><span className="account-brand-divider" aria-hidden="true"/><span>{t("m_5a2cac68fd")}</span></div><div className="account-topbar-actions"><LanguageSwitch /><ThemeToggle/><button className="account-mobile-logout" aria-label={t("m_3ab8cc1593")} disabled={loggingOut} onClick={async()=>{if(await logout())navigate('/login');}}><LogOut size={17}/></button><Link to="/" className="account-return">{t("m_26c8fe2777")}<ArrowUpRight size={15}/></Link></div></div></header>
 <div className="account-workspace"><aside className="account-sidebar"><div className="account-identity"><span className="account-identity-avatar" aria-hidden="true">{user?.username?.slice(0,1)||'M'}</span><div><strong>{user?.username}</strong><small>{t("m_6bcc35564f")}</small></div></div><p className="account-nav-label">{t("m_3797982942")}</p><nav aria-label={t("m_5a2cac68fd")}>{(user?.role==='owner'||user?.role==='admin')&&<NavLink to="/admin"><LayoutDashboard size={18}/>{t("m_d0d07d1531")}</NavLink>}<NavLink to="/account/settings"><UserRound size={18}/>{t("m_5ce662ac8d")}</NavLink><NavLink to="/account/mailbox"><Mail size={18}/>{t("m_2d7256702a")}</NavLink><NavLink to="/account/bookmarks"><Bookmark size={18}/>{t("m_9385bfefca")}</NavLink>{enabled&&<NavLink to="/account/submissions" className={({isActive})=>isActive||location.pathname.startsWith('/account/write')?'active':''}><FilePenLine size={18}/>{t("m_aff9ef1e32")}</NavLink>}{engagement&&<><NavLink to="/account/notifications"><Bell size={18}/>{t("m_b41f4fa6f5")}{unread>0&&<span aria-label={unread+t("m_c920c72351")}>{Math.min(unread,99)}</span>}</NavLink><NavLink to="/account/history"><History size={18}/>{t("m_1aac8f2911")}</NavLink></>}{operations&&<NavLink to="/account/sessions"><UserRound size={18}/>{t("m_cd438f5d0c")}</NavLink>}</nav><div className="account-sidebar-footer"><button disabled={loggingOut} onClick={async()=>{if(await logout())navigate('/login');}}><LogOut size={17}/>{loggingOut?t("m_0ae60dd37b"):t("m_3ab8cc1593")}</button>{logoutError&&<p role="alert">{t(logoutError || '')}</p>}</div></aside>
 <main className="account-content">{children}</main></div></div>;
}
