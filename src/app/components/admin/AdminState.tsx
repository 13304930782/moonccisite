import type { ReactNode } from 'react';
import '../../../styles/admin-feedback.css';

/** Shared loading / error / empty states so every admin list reads the same way. */
export function AdminLoading({ label = '正在加载…' }: { label?: string }) {
  return <div className="admin-state" role="status" aria-live="polite">
    <span className="admin-state-spinner" aria-hidden="true" />
    <span>{label}</span>
  </div>;
}

export function AdminError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="admin-state admin-state--error" role="alert">
    <p>{message}</p>
    {onRetry && <button type="button" className="quiet-button" onClick={onRetry}>重试</button>}
  </div>;
}

export function AdminEmpty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return <div className="admin-state admin-state--empty">
    <p className="admin-state-title">{title}</p>
    {hint && <p className="admin-state-hint">{hint}</p>}
    {action}
  </div>;
}

/** Inline, dismissible-by-context banner for the result of the last action. */
export function AdminNotice({ kind = 'error', children }: { kind?: 'error' | 'info'; children: ReactNode }) {
  return <div className={`admin-notice admin-notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}
