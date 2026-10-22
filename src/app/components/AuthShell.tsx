import { visibleDiagnostic } from '../lib/browserDiagnostics';
import { ReactNode, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SitePage } from './ContentUI';
import './AuthShell.css';
type AuthShellProps = {
  index?: string;
  modeLabel?: string;
  storyTitle?: ReactNode;
  storyDescription?: string;
  formTitle: string;
  formDescription: string;
  alternatePrompt: string;
  alternateLabel: string;
  alternateTo: string;
  children: ReactNode;
};
/**
 * Account pages share the homepage's language: a large hero headline on the left and a
 * soft, borderless panel on the right (stacked on narrow screens). Pages that provide a
 * story headline get the form title as the panel heading; the rest use the form title as the
 * page headline, so there is always exactly one h1.
 */
export function AuthShell({
  storyTitle,
  storyDescription,
  formTitle,
  formDescription,
  alternatePrompt,
  alternateLabel,
  alternateTo,
  children,
}: AuthShellProps) {
  const location=useLocation();
  const hasStory = Boolean(storyTitle);
  useEffect(() => { visibleDiagnostic(location.pathname,'interactive'); }, [location.key]);
  useEffect(() => {
    document.documentElement.classList.add('auth-touch-page');
    return () => document.documentElement.classList.remove('auth-touch-page');
  }, []);
  return (
    <SitePage>
      <section className="auth-layout">
        <div className="auth-intro">
          <p className="eyebrow">mooncci / 账户</p>
          <h1>{hasStory ? storyTitle : formTitle}</h1>
          <p className="auth-intro-text">{hasStory ? storyDescription : formDescription}</p>
        </div>
        <div className="auth-panel">
          {hasStory && (
            <div className="auth-panel-head">
              <h2>{formTitle}</h2>
              <p>{formDescription}</p>
            </div>
          )}
          <div className="auth-form-content">{children}</div>
          <div className="auth-alternate">
            {alternatePrompt && <span>{alternatePrompt}</span>}
            <Link className="text-link" to={alternateTo}>
              {alternateLabel} ↗
            </Link>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
