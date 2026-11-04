import { useI18n } from '../i18n';
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Check, Circle, Eye, EyeOff, Lock } from 'lucide-react';
import { FormInput } from './FormInput';
import { passwordChecks } from '../lib/passwordRules';

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> & {
  id: string;
  label: ReactNode;
  /** Right-aligned content on the label row, e.g. a "forgot password" link. */
  labelAside?: ReactNode;
  hint?: ReactNode;
  /** Field-level error shown beneath the input and announced to assistive tech. */
  error?: string;
};

/** Password input with a show/hide control, so typos are visible before submitting. */
export function PasswordField({ id, label, labelAside, hint, error, className, ...props }: PasswordFieldProps) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const messageId = useId();
  const describedBy = [props['aria-describedby'], hint ? `${messageId}-hint` : '', error ? `${messageId}-error` : ''].filter(Boolean).join(' ') || undefined;
  return <div className="auth-field">
    <div className="auth-field-label">
      <label htmlFor={id}>{label}</label>
      {labelAside}
    </div>
    <div className="auth-field-control auth-field-control--reveal">
      <Lock aria-hidden="true" />
      <FormInput {...props} id={id} type={visible ? 'text' : 'password'} className={className}
        aria-invalid={error ? true : undefined} aria-describedby={describedBy}
        autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="button" className="auth-reveal" aria-pressed={visible} aria-controls={id}
        aria-label={visible ? t("m_dd1d07bd9c") : t("m_ffe21a6711")} onClick={() => setVisible(value => !value)}>
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
    {hint && !error && <p className="auth-helper" id={`${messageId}-hint`}>{hint}</p>}
    {error && <p className="auth-form-error" id={`${messageId}-error`} role="alert">{t(error || '')}</p>}
  </div>;
}

/** Live checklist: state is spelled out in text, never by colour alone. */
export function PasswordRules({ password }: { password: string }) {
  const { t } = useI18n();
  if (!password) return null;
  return <ul className="password-rules" aria-label={t("m_f50f65a09f")}>
    {passwordChecks(password).filter(check => check.id !== 'bytes' || !check.ok).map(check => <li key={check.id} data-ok={check.ok}>
      {check.ok ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
      <span>{t(check.label)}<span className="sr-only">{check.ok ? t("m_5c6ae5a443") : t("m_a189d17bef")}</span></span>
    </li>)}
  </ul>;
}
