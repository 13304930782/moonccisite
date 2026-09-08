import { ReactNode, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SitePage, PageHeading } from './ContentUI';
import './AuthShell.css';
type AuthShellProps = {
  index: string;
  modeLabel: string;
  storyTitle: ReactNode;
  storyDescription: string;
  formTitle: string;
  formDescription: string;
  alternatePrompt: string;
  alternateLabel: string;
  alternateTo: string;
  children: ReactNode;
};
export function AuthShell({
  formTitle,
  formDescription,
  alternatePrompt,
  alternateLabel,
  alternateTo,
  children,
}: AuthShellProps) {
  useEffect(() => {
    document.documentElement.classList.add('auth-touch-page');
    return () => document.documentElement.classList.remove('auth-touch-page');
  }, []);
  return (
    <SitePage>
      <section className="auth-layout">
        <PageHeading eyebrow="账户" title={formTitle}>
          <p>{formDescription}</p>
        </PageHeading>
        <div className="auth-form-content">{children}</div>
        <div className="auth-alternate">
          <span>{alternatePrompt}</span>
          <Link className="text-link" to={alternateTo}>
            {alternateLabel} ↗
          </Link>
        </div>
      </section>
    </SitePage>
  );
}
