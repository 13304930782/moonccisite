import { motion } from 'motion/react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
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
  index,
  modeLabel,
  storyTitle,
  storyDescription,
  formTitle,
  formDescription,
  alternatePrompt,
  alternateLabel,
  alternateTo,
  children,
}: AuthShellProps) {
  return (
    <main className="auth-page neo-dot-grid">
      <motion.section
        initial={{ opacity: 0, y: 26, rotate: -0.25 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
        className="auth-shell"
      >
        <aside className="auth-story">
          <div className="auth-story-top">
            <Link to="/" className="auth-brand" aria-label="返回 Mooncci Blog 首页">
              <span className="auth-brand-icon"><Sparkles /></span>
              <span>Mooncci Blog</span>
            </Link>
            <span className="auth-index">{index}</span>
          </div>

          <div className="auth-story-copy">
            <span className="auth-kicker">{modeLabel}</span>
            <h1>{storyTitle}</h1>
            <p>{storyDescription}</p>
          </div>

          <div className="auth-field-note">
            <div className="auth-field-note-head">
              <span>MOONCCI / FIELD NOTE</span>
              <Sparkles aria-hidden="true" />
            </div>
            <p>把每一次登录和注册，都看作重新进入知识现场的通行证。</p>
            <div className="auth-field-note-tags" aria-hidden="true">
              <span>READ</span>
              <span>THINK</span>
              <span>BUILD</span>
            </div>
          </div>
        </aside>

        <section className="auth-form-side">
          <div className="auth-form-meta">
            <Link to="/" className="auth-back-link"><ArrowLeft /> 返回首页</Link>
            <span>{modeLabel}</span>
          </div>

          <div className="auth-form-heading">
            <span>MEMBER PORTAL</span>
            <h2>{formTitle}</h2>
            <p>{formDescription}</p>
          </div>

          {children}

          <div className="auth-alternate">
            <span>{alternatePrompt}</span>
            <Link to={alternateTo}>{alternateLabel} <span aria-hidden="true">↗</span></Link>
          </div>
        </section>
      </motion.section>
    </main>
  );
}
