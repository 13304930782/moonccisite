import { LanguageSwitch } from '../LanguageSwitch';
import { useI18n } from '../../i18n';
import { reducedMotion } from '../../lib/motionPreference';
import { focusableWithin, loopFocus } from '../../lib/focusLoop';
import { useOperations } from '../../lib/useOperations';
import { usePublishing } from '../../lib/usePublishing';
import { ThemeToggle } from '../../context/ThemeContext';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Link } from '../LocaleLink';
import { ArrowUp, Activity, Bell, CalendarClock, CalendarDays, ChartColumn, ContactRound, FilePenLine, KeyRound, Library, AtSign, Mailbox, Newspaper, PanelsTopLeft, Radio, SearchCheck, Server, Sparkles, UserRound, Zap, Ban, FileText, Home, Image, Inbox, LayoutDashboard, LogOut, Menu, MessageCircle, PenLine, Settings, ShieldCheck, UserRoundCheck, Users, X, Tags, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import '../../../styles/workspace-polish.css';
import '../../../styles/admin-workspace.css';

type MenuItem = { title: string; to: string; icon: typeof LayoutDashboard; show: boolean };
type MenuGroup = { id: string; label: string; items: MenuItem[] };
const menuOpen = new Map<string, string[]>();
const compactNavigation = () => window.matchMedia('(max-width:1023px)').matches;
function getRoleName(role?: string) {
  return role === 'owner' ? '站长' : role === 'admin' ? '管理员' : role === 'editor' ? '编辑' : role === 'teacher' ? '教师' : '普通用户';
}
export function AdminShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { user, logout, loggingOut, logoutError } = useAuth();
  const location = useLocation();
  const role = user?.role || 'user', owner = role === 'owner', manager = owner || role === 'admin', writer = manager || role === 'editor';
  const publishing = usePublishing(), operations = useOperations();
  const dashboard = manager && operations ? '/admin/operations' : '/admin';
  const userKey = String(user?.id || role);
  const mainRef = useRef<HTMLElement>(null), sidebarRef = useRef<HTMLElement>(null), mobileBarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null), mobileMenuRef = useRef<HTMLElement>(null);
  const [showTop, setShowTop] = useState(false), [mobileOpen, setMobileOpen] = useState(false);
  const [navInput, setNavInput] = useState<'pointer'|'keyboard'>('keyboard');
  const [openGroups, setOpenGroups] = useState<string[]>(() => menuOpen.get(userKey) || []);
  const itemActive = (item: MenuItem) => item.to === dashboard
    ? location.pathname === '/admin' || location.pathname === '/admin/operations'
    : location.pathname === item.to || location.pathname.startsWith(item.to + '/');
  const commonItems: MenuItem[] = [
    {title:t('工作台'),to:dashboard,icon:LayoutDashboard,show:writer},
    {title:t('文章'),to:'/admin/posts',icon:FileText,show:writer},
    {title:t('评论'),to:'/admin/comments',icon:MessageCircle,show:manager},
    {title:t('访问统计'),to:'/admin/analytics',icon:ChartColumn,show:manager},
  ].filter(item => item.show);
  const menuGroups: MenuGroup[] = [
    {id:'content',label:t('内容'),items:[
      {title:t('近况'),to:'/admin/updates',icon:Radio,show:manager},
      {title:t('作品'),to:'/admin/projects',icon:PanelsTopLeft,show:manager},
      {title:t('媒体库'),to:'/admin/media',icon:Image,show:manager},
      {title:t('分类与标签'),to:'/admin/taxonomy',icon:Tags,show:manager},
      {title:t('文章系列'),to:'/admin/series',icon:Library,show:manager&&publishing},
    ]},
    {id:'publishing',label:t('发布'),items:[
      {title:t('投稿审核'),to:'/admin/reviews',icon:Inbox,show:manager&&publishing},
      {title:t('发布计划'),to:'/admin/schedules',icon:CalendarClock,show:manager&&publishing},
    ]},
    {id:'users',label:t('用户'),items:[
      {title:t('用户管理'),to:'/admin/users',icon:Users,show:manager},
      {title:t('编辑申请'),to:'/admin/editor-applications',icon:UserRoundCheck,show:manager},
      {title:t('申请编辑权限'),to:'/admin/editor-apply',icon:FilePenLine,show:!writer},
      {title:t('词语过滤'),to:'/admin/banned-words',icon:Ban,show:manager},
    ]},
    {id:'mail',label:t('邮件'),items:[
      {title:t('我的邮箱'),to:'/admin/mailbox',icon:Mailbox,show:owner},
      {title:t('邮箱申请'),to:'/admin/mailbox-requests',icon:ShieldCheck,show:owner},
      {title:t('订阅周报'),to:'/admin/newsletter',icon:Newspaper,show:owner},
      {title:t('发送邮件'),to:'/admin/send-mail',icon:Bell,show:manager},
      {title:t('邮件配置'),to:'/admin/mail-settings',icon:AtSign,show:manager},
    ]},
    {id:'site',label:t('站点'),items:[
      {title:t('站点设置'),to:'/admin/site-settings',icon:Settings,show:manager},
      {title:t('页面与友链'),to:'/admin/blog-pages',icon:ContactRound,show:manager},
      {title:t('节日动效'),to:'/admin/festivals',icon:CalendarDays,show:manager},
      {title:t('SEO 与索引'),to:'/admin/seo',icon:SearchCheck,show:manager},
    ]},
    {id:'system',label:t('系统'),items:[
      {title:t('运行状态'),to:'/admin/runtime',icon:Activity,show:manager},
      {title:t('登录方式'),to:'/admin/login-settings',icon:KeyRound,show:owner},
      {title:t('AI 设置'),to:'/admin/ai-settings',icon:Sparkles,show:owner},
      {title:t('节点连接'),to:'/admin/node-monitor',icon:Server,show:owner},
      {title:t('宿舍电量'),to:'/admin/electricity',icon:Zap,show:owner},
    ]},
  ].map(group => ({...group,items:group.items.filter(item => item.show)})).filter(group => group.items.length);
  const activeGroup = menuGroups.find(group => group.items.some(itemActive))?.id;
  useEffect(() => {
    setMobileOpen(false); mainRef.current?.scrollTo({top:0,behavior:'instant'}); setShowTop(false);
    setOpenGroups(previous => {
      const available = (menuOpen.get(userKey) || previous).filter(id => menuGroups.some(group => group.id === id));
      const next = (activeGroup ? [...available.filter(id => id !== activeGroup),activeGroup] : available).slice(compactNavigation() ? -1 : -2);
      menuOpen.set(userKey,next); return next;
    });
  }, [location.pathname,activeGroup,userKey,role,publishing]);
  useEffect(() => {
    const media = window.matchMedia('(max-width:1023px)');
    const resize = () => {
      if (!media.matches) setMobileOpen(false);
      setOpenGroups(previous => { const next=previous.slice(media.matches?-1:-2);menuOpen.set(userKey,next);return next; });
    };
    media.addEventListener('change',resize);
    return () => media.removeEventListener('change',resize);
  }, [userKey]);
  useEffect(() => {
    if (!mobileOpen) return;
    const background = [mainRef.current,sidebarRef.current,mobileBarRef.current].filter((element): element is HTMLElement => !!element);
    const previous = background.map(element => element.inert);
    background.forEach(element => { element.inert=true; });
    const frame=requestAnimationFrame(() => { const menu=mobileMenuRef.current;if(menu)(focusableWithin(menu)[0]||menu).focus({preventScroll:true}); });
    const keys=(event:KeyboardEvent) => {
      if(event.defaultPrevented || (event.target as Element).closest('.language-menu'))return;
      if(event.key==='Escape'){event.preventDefault();setMobileOpen(false);}
      else if(mobileMenuRef.current)loopFocus(event,mobileMenuRef.current);
    };
    window.addEventListener('keydown',keys);
    return () => {cancelAnimationFrame(frame);window.removeEventListener('keydown',keys);background.forEach((element,index)=>{element.inert=previous[index];});if(menuButtonRef.current?.offsetParent)menuButtonRef.current.focus({preventScroll:true});};
  }, [mobileOpen]);
  useLayoutEffect(() => {
    const menus=[sidebarRef.current,mobileMenuRef.current].map(root=>root?.querySelector<HTMLElement>('.admin-menu')).filter((menu):menu is HTMLElement=>!!menu);
    const update=()=>menus.forEach(menu=>{
      const indicator=menu.querySelector<HTMLElement>('.admin-menu-indicator'),active=menu.querySelector<HTMLElement>('a[aria-current="page"]');
      if(!indicator)return;
      if(!active||!active.getClientRects().length){indicator.hidden=true;return;}
      const menuRect=menu.getBoundingClientRect(),activeRect=active.getBoundingClientRect(),area=menu.parentElement!.getBoundingClientRect();
      const common=menu.querySelector<HTMLElement>('.admin-nav-common'),commonRect=common?.getBoundingClientRect(),inCommon=!!active.closest('.admin-nav-common');
      // Sticky movement is scroll compensation, not a new animated selection.
      const stickyOffset=inCommon&&commonRect?commonRect.top-menuRect.top:0;
      const clipTop=Math.max(0,(inCommon?area.top:commonRect?.bottom||area.top)-activeRect.top),clipBottom=Math.max(0,activeRect.bottom-area.bottom);
      indicator.hidden=clipTop+clipBottom>=activeRect.height;
      indicator.style.top=`${stickyOffset}px`;
      indicator.style.transform=`translateY(${activeRect.top-menuRect.top-stickyOffset}px)`;
      indicator.style.height=`${activeRect.height}px`;
      indicator.style.clipPath=`inset(${clipTop}px 0 ${clipBottom}px 0)`;
    });
    update();const frame=requestAnimationFrame(()=>menus.forEach(menu=>{menu.dataset.indicatorReady='true';}));
    const observer=new ResizeObserver(update);menus.forEach(menu=>{observer.observe(menu);menu.parentElement?.addEventListener('scroll',update,{passive:true});});window.addEventListener('resize',update);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();menus.forEach(menu=>menu.parentElement?.removeEventListener('scroll',update));window.removeEventListener('resize',update);};
  }, [location.pathname,mobileOpen,openGroups,role,operations]);
  useEffect(() => {
    const frame=requestAnimationFrame(()=>[sidebarRef.current,mobileMenuRef.current].forEach(root=>{
      const scroller=root?.querySelector<HTMLElement>('.admin-nav-scroll'),active=root?.querySelector<HTMLElement>('.admin-menu a[aria-current="page"]');
      if(!scroller||!active||!active.getClientRects().length)return;
      const area=scroller.getBoundingClientRect(),item=active.getBoundingClientRect();
      const top=active.closest('.admin-nav-common')?area.top:root?.querySelector<HTMLElement>('.admin-nav-common')?.getBoundingClientRect().bottom||area.top;
      const delta=item.top<top?item.top-top:item.bottom>area.bottom?item.bottom-area.bottom:0;
      if(delta)scroller.scrollBy({top:delta,behavior:reducedMotion()?'instant':'smooth'});
    }));return()=>cancelAnimationFrame(frame);
  }, [location.pathname,mobileOpen,openGroups]);
  useEffect(() => {
    const html=document.documentElement,body=document.body;
    const previous=[html.style.overflow,body.style.overflow,body.style.height,body.style.overscrollBehavior];
    html.style.overflow='hidden';body.style.overflow='hidden';body.style.height='100%';body.style.overscrollBehavior='none';
    return()=>{[html.style.overflow,body.style.overflow,body.style.height,body.style.overscrollBehavior]=previous;};
  }, []);
  function toggleGroup(id:string) {
    setOpenGroups(previous=>{const next=previous.includes(id)?previous.filter(value=>value!==id):[...previous,id].slice(compactNavigation()?-1:-2);menuOpen.set(userKey,next);return next;});
  }
  const closeMobile=()=>setMobileOpen(false);
  const handleLogout=async()=>{if(await logout())closeMobile();};
  const navItem=(item:MenuItem)=><Link key={item.to} to={item.to} aria-current={itemActive(item)?'page':undefined} onClick={closeMobile}><item.icon aria-hidden="true"/><span>{item.title}</span></Link>;
  const MenuContent=({mobile=false}:{mobile?:boolean}={})=><>
    <header className="admin-nav-top">
      <div className="admin-menu-head"><Link className="site-brand" to={writer?dashboard:'/account/settings'} onClick={closeMobile}>mooncci</Link>{mobile&&<button type="button" className="icon-button" aria-label={t('关闭后台菜单')} onClick={closeMobile}><X/></button>}</div>

      <div className="admin-nav-controls"><LanguageSwitch/><ThemeToggle/></div>
      {writer&&<Link className="admin-nav-write" to="/admin/write" onClick={closeMobile} aria-current={location.pathname==='/admin/write'?'page':undefined}><PenLine size={17} aria-hidden="true"/>{t('写文章')}</Link>}
    </header>
    <div className="admin-nav-scroll"><nav className="admin-menu" aria-label={t('后台导航')}>
      <span className="admin-menu-indicator" aria-hidden="true" hidden/>
      {commonItems.length>0&&<div className="admin-nav-common">{commonItems.map(navItem)}</div>}
      {menuGroups.map(group=><section className="admin-nav-group" key={group.id} data-current={activeGroup===group.id}>
        <button type="button" className="admin-nav-group-toggle" aria-expanded={openGroups.includes(group.id)} aria-controls={`admin-${mobile?'mobile':'desktop'}-${group.id}`} onClick={()=>toggleGroup(group.id)}><span>{group.label}</span><span className="admin-nav-group-end">{activeGroup===group.id&&!openGroups.includes(group.id)&&<i aria-label={t('当前页面所在分组')}/>}<ChevronDown size={15} aria-hidden="true"/></span></button>
        <div id={`admin-${mobile?'mobile':'desktop'}-${group.id}`} className="admin-nav-group-items" hidden={!openGroups.includes(group.id)}>{group.items.map(navItem)}</div>
      </section>)}
    </nav></div>
    <footer className="admin-nav-footer">
      <Link className="admin-nav-account" to="/account/settings" onClick={closeMobile} aria-label={user?.username+' · '+t(getRoleName(role))+' · '+t('账号设置')}>
        <span className="admin-nav-avatar" aria-hidden="true"><UserRound size={19}/></span>
        <span className="admin-nav-account-copy"><strong title={user?.username}>{user?.username}</strong><small>{t(getRoleName(role))}</small></span>
        <span className="admin-nav-account-action">{t('设置')}<ChevronRight size={14} aria-hidden="true"/></span>
      </Link>
      <div className="admin-nav-personal"><Link to="/" onClick={closeMobile}><Home size={15} aria-hidden="true"/>{t('返回网站')}</Link><button type="button" onClick={handleLogout} disabled={loggingOut}><LogOut size={15} aria-hidden="true"/>{loggingOut?t('正在退出…'):t('退出登录')}</button></div>
      {logoutError&&<p role="alert">{t(logoutError)}</p>}
    </footer>
  </>;
  return <div className="admin-frame admin-navigation" data-nav-input={navInput} onPointerDownCapture={()=>setNavInput('pointer')} onKeyDownCapture={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&event.key!=='Shift')setNavInput('keyboard');}}>
    <aside className="admin-sidebar" ref={sidebarRef}>{MenuContent()}</aside>
    <header className="admin-mobile-bar" ref={mobileBarRef}><button ref={menuButtonRef} type="button" className="icon-button" aria-label={mobileOpen?t('关闭后台菜单'):t('打开后台菜单')} aria-expanded={mobileOpen} aria-controls="admin-mobile-menu" onClick={()=>setMobileOpen(!mobileOpen)}><Menu/></button><span className="admin-mobile-location">{[...commonItems,...menuGroups.flatMap(group=>group.items)].find(itemActive)?.title||t('后台')}</span><ThemeToggle/></header>
    {mobileOpen&&<div className="admin-mobile-layer"><button type="button" className="admin-menu-backdrop" aria-label={t('关闭菜单')} tabIndex={-1} onClick={closeMobile}/><aside id="admin-mobile-menu" ref={mobileMenuRef} role="dialog" aria-modal="true" aria-label={t('后台导航')} tabIndex={-1}>{MenuContent({mobile:true})}</aside></div>}
    <main className="admin-main" ref={mainRef} tabIndex={-1} onScroll={event=>setShowTop(event.currentTarget.scrollTop>320)}><div className="admin-content" key={location.pathname}>{children}</div></main>
    {showTop&&!mobileOpen&&<button className="admin-back-top" type="button" onClick={()=>{const main=mainRef.current;if(!main)return;const heading=main.querySelector<HTMLElement>('h1')||main;heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});main.scrollTo({top:0,behavior:reducedMotion()?'instant':'smooth'});}} aria-label={t('返回顶部')}><ArrowUp size={18} aria-hidden="true"/><span>{t('返回顶部')}</span></button>}
  </div>;
}
export default AdminShell;
