import {useOperations} from '../lib/useOperations';
import '../../styles/workspace-polish.css';
import {Link,NavLink,useNavigate} from 'react-router-dom';
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
 const enabled=usePublishing(),{user,logout,loggingOut,logoutError}=useAuth(),navigate=useNavigate();
 const operations=useOperations();
 const engagement=useEngagement(),[unread,setUnread]=useState(0);
 useEffect(()=>{if(!engagement)return;const poll=()=>{if(document.visibilityState==='visible')api('/engagement/notifications/unread').then(r=>setUnread(r.unread)).catch(()=>{});};poll();const timer=setInterval(poll,60000);document.addEventListener('visibilitychange',poll);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',poll);};},[engagement]);
 return <div className="account-shell">
 <header className="account-topbar"><div className="account-topbar-inner"><div className="account-brand"><Link to="/" className="site-brand">mooncci</Link><span className="account-brand-divider" aria-hidden="true"/><span>个人中心</span></div><div className="account-topbar-actions"><ThemeToggle/><button className="account-mobile-logout" aria-label="退出登录" disabled={loggingOut} onClick={async()=>{if(await logout())navigate('/login');}}><LogOut size={17}/></button><Link to="/" className="account-return">返回网站<ArrowUpRight size={15}/></Link></div></div></header>
 <div className="account-workspace"><aside className="account-sidebar"><div className="account-identity"><span className="account-identity-avatar" aria-hidden="true">{user?.username?.slice(0,1)||'M'}</span><div><strong>{user?.username}</strong><small>个人账户</small></div></div><p className="account-nav-label">工作区</p><nav aria-label="个人中心">{(user?.role==='owner'||user?.role==='admin')&&<NavLink to="/admin"><LayoutDashboard size={18}/>控制台</NavLink>}<NavLink to="/account/settings"><UserRound size={18}/>账号设置</NavLink><NavLink to="/account/mailbox"><Mail size={18}/>我的邮箱</NavLink><NavLink to="/account/bookmarks"><Bookmark size={18}/>我的收藏</NavLink>{enabled&&<NavLink to="/account/submissions" className={({isActive})=>isActive||location.pathname.startsWith('/account/write')?'active':''}><FilePenLine size={18}/>我的投稿</NavLink>}{engagement&&<><NavLink to="/account/notifications"><Bell size={18}/>通知中心{unread>0&&<span aria-label={unread+' 条未读'}>{Math.min(unread,99)}</span>}</NavLink><NavLink to="/account/history"><History size={18}/>阅读历史</NavLink></>}{operations&&<NavLink to="/account/sessions"><UserRound size={18}/>登录设备</NavLink>}</nav><div className="account-sidebar-footer"><button disabled={loggingOut} onClick={async()=>{if(await logout())navigate('/login');}}><LogOut size={17}/>{loggingOut?'正在退出…':'退出登录'}</button>{logoutError&&<p role="alert">{logoutError}</p>}</div></aside>
 <main className="account-content">{children}</main></div></div>;
}
