import {splitLocalePath} from '../lib/locale';
import { LanguageSwitch } from './LanguageSwitch';
import { useI18n } from '../i18n';
import { responsiveImage } from '../lib/responsiveImage';
import {usePublishing} from '../lib/usePublishing';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {Link} from './LocaleLink';
import { FestivalSlot } from './Festivals/Entry';
import { Menu, Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from '../context/ThemeContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { safeImageSrc } from '../lib/safeUrl';
import { preloadPage } from '../lib/preloadPage';
import {focusableWithin,loopFocus} from '../lib/focusLoop';
import '../../styles/navigation.css';
export function Header() {
  const { t } = useI18n();
  const header = useRef<HTMLElement>(null);
  const menuButton=useRef<HTMLButtonElement>(null),menuPanel=useRef<HTMLDivElement>(null);
  const closeAccount = () => header.current?.querySelectorAll('details[open]').forEach(item => item.removeAttribute('open'));
  const { user, logout, loggingOut, logoutError } = useAuth();
  const publishing=usePublishing();
  const { data: settings } = useSiteSettings();
  const brand = settings?.brand || {};
  const [menu, setMenu] = useState(false),
    [search, setSearch] = useState(false),
    [keyword, setKeyword] = useState('');
  const [scrolled,setScrolled]=useState(false);
  const [mobile,setMobile]=useState(false);
  function closeMenu(){setMenu(false);menuButton.current?.focus({preventScroll:true});}
  useEffect(()=>{
    const media=window.matchMedia('(max-width:1100px)');
    const update=()=>{setMobile(media.matches);if(!media.matches)setMenu(false);};
    update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);
  },[]);
  useEffect(()=>{
    const closeForReading=(event:Event)=>{if((event as CustomEvent).detail?.open)setMenu(false);};
    window.addEventListener('mooncci:reading-tools-state',closeForReading);
    return()=>window.removeEventListener('mooncci:reading-tools-state',closeForReading);
  },[]);
  useEffect(()=>{
    document.body.classList.toggle('menu-open',menu);
    window.dispatchEvent(new CustomEvent('mooncci:menu-state',{detail:{open:menu}}));
    if(!menu)return;
    const frame=requestAnimationFrame(()=>{if(menuPanel.current)focusableWithin(menuPanel.current)[0]?.focus({preventScroll:true});});
    const keys=(event:KeyboardEvent)=>{
      if(event.defaultPrevented || (event.target as Element).closest('.language-menu'))return;
      if(event.key==='Escape'){event.preventDefault();closeMenu();}
      else if(menuPanel.current)loopFocus(event,menuPanel.current);
    };
    window.addEventListener('keydown',keys);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('keydown',keys);document.body.classList.remove('menu-open');};
  },[menu]);
  useEffect(()=>{
    const update=()=>setScrolled(window.scrollY>8);
    update();window.addEventListener('scroll',update,{passive:true});
    return()=>window.removeEventListener('scroll',update);
  },[]);
  const navigate = useNavigate(),
    routerLocation = useLocation();
  const location={...routerLocation,pathname:splitLocalePath(routerLocation.pathname).pathname};
  useEffect(() => {
    setMenu(false);
    setSearch(false);
    closeAccount();
  }, [location.pathname, location.search]);
  useEffect(() => {
    function close(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeAccount();
        setMenu(false);
        setSearch(false);
      }
    }
    const outside = (event: PointerEvent) => { if (!(event.target instanceof Element) || !event.target.closest('.nav-disclosure')) closeAccount(); };
    window.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('keydown', close); document.removeEventListener('pointerdown', outside); };
  }, []);
  const admin =
    user && ['owner', 'admin', 'editor'].includes(user.role)
      ? '/admin'
      : '/admin/editor-apply';
  const links = [
    ['/articles', t("m_7d5a89f6b1")],
    ['/updates', t("m_b067526e73")],
    ['/projects', t("m_37a3a79686")],
    ['/electricity', t("m_562a442845")],
    ['https://cuegroveapp.com', 'Early Access'],
  ];
  function submit(e: FormEvent) {
    e.preventDefault();
    if (keyword.trim())
      navigate('/search?q=' + encodeURIComponent(keyword.trim()));
  }
  const accountMenu = (user ? (
              <details className="nav-disclosure">
                <summary>{user.username}</summary>
                <div className="nav-popover">
                  <Link to={admin}>
                    {user.role === 'user' ? t("m_6ef4c0ce0a") : t("m_d0d07d1531")}
                  </Link>
                  <Link to="/account/settings">{t("m_c2952a5ffc")}</Link>{publishing&&<Link to="/account/submissions">{t("m_aff9ef1e32")}</Link>}
              <button onClick={() => void logout()} disabled={loggingOut}>
                    {loggingOut ? t("m_0ae60dd37b") : t("m_3ab8cc1593")}
                  </button>
                </div>
              </details>
            ) : (
              <Link to="/login">{t("m_e5533fd283")}</Link>
            ));
  return (
    <header className={`site-header${scrolled?' is-scrolled':''}`} ref={header}>
      <div className="site-container header-inner">
        <Link className="site-brand" to="/">
          {location.pathname === '/' && <FestivalSlot name="logo" />}
          {safeImageSrc(brand.logo_url) && (
            <img {...responsiveImage(safeImageSrc(brand.logo_url), true)} width={26} height={26} alt="" />
          )}
          <span>mooncci</span>
        </Link>
        <nav className="desktop-nav" aria-label={t("m_9bae680405")}>
          {links.map(([to, label]) => (
            <Link key={to} to={to} className={location.pathname===to||location.pathname.startsWith(to+'/')?'active':''} aria-current={location.pathname===to||location.pathname.startsWith(to+'/')?'page':undefined} onPointerEnter={() => preloadPage(to)} onFocus={() => preloadPage(to)} onTouchStart={() => preloadPage(to)}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-actions"><div className="header-language"><LanguageSwitch /></div>
          <button
            className="icon-button"
            onClick={() => {setMenu(false);setSearch(!search);}}
            aria-label={mobile?t("m_44ce7ae909"):t("m_a8322456d1")}
            aria-expanded={search}
          >
            <Search />
          </button>
          <div className="header-theme"><ThemeToggle label={mobile?t("m_dde7e3dbce"):undefined}/></div>
          <div className="header-account">
            {accountMenu}
          </div>
          <button
            ref={menuButton}
            className="icon-button mobile-menu-button"
            aria-expanded={menu}
            aria-controls="mobile-navigation"
            aria-label={menu ? t("m_be0d5706c6") : t("m_edb9858183")}
            onClick={() => {if(menu)closeMenu();else{setSearch(false);setMenu(true);}}}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      {search && (
        <form className="site-container header-search" onSubmit={submit}>
          <label className="sr-only" htmlFor="header-query">
             {t("m_a8322456d1")} </label>
          <input
            id="header-query"
            autoFocus
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t("m_eeb50b770d")}
          />
          <button className="quiet-button">{t("m_44ce7ae909")}</button>
        </form>
      )}
      {menu && (
        <><div className="m-backdrop" aria-hidden="true" onClick={closeMenu}/><div className="mobile-menu-panel m-panel" ref={menuPanel} tabIndex={-1}>
        <nav
          id="mobile-navigation"
          className="mobile-navigation"
          aria-label={t("m_d4d72cf314")}
        >
          {links.slice(0,3).map(([to,label])=><Link key={to} to={to} className={`m-link${(to==='/articles'?/^\/articles?(\/|$)/.test(location.pathname):location.pathname===to||location.pathname.startsWith(to+'/'))?' is-current':''}`} aria-current={(to==='/articles'?/^\/articles?(\/|$)/.test(location.pathname):location.pathname===to||location.pathname.startsWith(to+'/'))?'page':undefined} onClick={closeMenu}>{label}</Link>)}
          <div className="m-sub">{links.slice(3).map(([to,label])=><Link key={to} to={to} className={`m-link${location.pathname===to?' is-current':''}`} aria-current={location.pathname===to?'page':undefined} onClick={closeMenu}>{label}</Link>)}</div>
        </nav>
        <div className="navigation-language-row"><span>{t("m_3d13868593")}</span><LanguageSwitch /></div>
        {user?<div className="mobile-account-menu" onClick={event=>{if((event.target as Element).closest('a'))closeMenu();}}>{accountMenu}</div>:<Link className="m-login" to="/login" onClick={closeMenu}>{t("m_1e2df9c307")}</Link>}
        </div></>
      )}
      {logoutError && (
        <p
          className="site-container py-2 text-sm text-destructive"
          role="alert"
        >
          {t(logoutError || '')}
        </p>
      )}
    </header>
  );
}
