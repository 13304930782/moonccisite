import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { ReactNode, useEffect, useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './CardNav.css';

export type CardNavLink = {
  label: string;
  ariaLabel: string;
  to?: string;
  onClick?: () => void;
};

export type CardNavItem = {
  label: string;
  eyebrow: string;
  bgColor: string;
  textColor: string;
  links: CardNavLink[];
  extra?: ReactNode;
};

type CardNavProps = {
  brand: string;
  logo?: string;
  logoFallback: ReactNode;
  items: CardNavItem[];
  cta: ReactNode;
};

export function CardNav({ brand, logo, logoFallback, items, cta }: CardNavProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();
  const location = useLocation();

  useEffect(() => {
    setIsExpanded(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isExpanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsExpanded(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isExpanded]);

  const closeMenu = () => setIsExpanded(false);

  return (
    <header className="card-nav-shell">
      <motion.nav
        layout
        transition={{ layout: { duration: 0.36, ease: [0.16, 1, 0.3, 1] } }}
        className={`card-nav ${isExpanded ? 'is-open' : ''}`}
        aria-label="主导航"
      >
        <div className="card-nav-top">
          <button
            type="button"
            className={`card-nav-menu ${isExpanded ? 'is-open' : ''}`}
            onClick={() => setIsExpanded((open) => !open)}
            aria-label={isExpanded ? '关闭导航菜单' : '打开导航菜单'}
            aria-expanded={isExpanded}
            aria-controls={contentId}
          >
            <span className="card-nav-menu-line" />
            <span className="card-nav-menu-line" />
            <span className="card-nav-menu-label">{isExpanded ? '关闭' : '菜单'}</span>
          </button>

          <Link to="/" className="card-nav-brand" aria-label="返回首页" onClick={closeMenu}>
            <span className="card-nav-logo">
              {logo ? <img src={logo} alt="" /> : logoFallback}
            </span>
            <span className="card-nav-brand-name">{brand}</span>
          </Link>

          <div className="card-nav-cta">{cta}</div>
        </div>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              id={contentId}
              className="card-nav-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="card-nav-grid">
                {items.slice(0, 3).map((item, index) => (
                  <motion.section
                    key={item.label}
                    className="card-nav-card"
                    style={{ backgroundColor: item.bgColor, color: item.textColor }}
                    initial={{ y: 34, opacity: 0, rotate: index === 1 ? 1 : -1 }}
                    animate={{ y: 0, opacity: 1, rotate: 0 }}
                    exit={{ y: 20, opacity: 0 }}
                    transition={{ delay: 0.08 + index * 0.07, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="card-nav-card-heading">
                      <span>{item.eyebrow}</span>
                      <strong>{item.label}</strong>
                    </div>

                    <div className="card-nav-links">
                      {item.links.map((link) => (
                        link.to ? (
                          <Link
                            key={link.label}
                            to={link.to}
                            aria-label={link.ariaLabel}
                            className="card-nav-link"
                            onClick={closeMenu}
                          >
                            <ArrowUpRight aria-hidden="true" />
                            <span>{link.label}</span>
                          </Link>
                        ) : (
                          <button
                            key={link.label}
                            type="button"
                            aria-label={link.ariaLabel}
                            className="card-nav-link"
                            onClick={() => {
                              link.onClick?.();
                              closeMenu();
                            }}
                          >
                            <ArrowUpRight aria-hidden="true" />
                            <span>{link.label}</span>
                          </button>
                        )
                      ))}
                    </div>

                    {item.extra && <div className="card-nav-extra">{item.extra}</div>}
                  </motion.section>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>
    </header>
  );
}
