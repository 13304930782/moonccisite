import { useI18n } from '../i18n';
import { FormEvent, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {Link} from '../components/LocaleLink';
import {authLink,loginDestination} from '../lib/loginDestination';
import { api } from '../lib/api';
import { AuthShell } from '../components/AuthShell';
import { PasswordField, PasswordRules } from '../components/PasswordField';
import { passwordProblem } from '../lib/passwordRules';

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const destination=loginDestination(params.get('redirect'));
  const [token] = useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('token')||params.get('token')||'');
  useEffect(()=>{const url=new URL(window.location.href);url.searchParams.delete('token');if(url.hash.startsWith('#token='))url.hash='';window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);},[]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [done,setDone] = useState(false);
  const mismatch = confirmTouched && confirmPassword !== '' && password !== confirmPassword;

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!token) {
      setMessage(t("m_d4f2da1a33"));
      return;
    }

    if (!password || !confirmPassword) {
      setMessage(t("m_76fc751040"));
      return;
    }

    const problem = passwordProblem(password);
    if (problem) {
      setMessage(problem);
      return;
    }

    if (password !== confirmPassword) {
      setConfirmTouched(true);
      setMessage(t("m_5880774570"));
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });

      setMessage(res.message || t("m_78535a7180"));
      setDone(true);
    } catch (err: any) {
      setMessage(err.message || t("m_4230b35334"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell formTitle={t("m_d70928debc")} formDescription={t("m_08ebfd497b")}
      alternatePrompt="" alternateLabel={t("m_747b0f9082")} alternateTo={authLink('/login',destination)}>
        {message && (
          <div className={`auth-message${done ? ' is-success' : ' is-error'}`} role={done ? 'status' : 'alert'}>
            {t(message || '')}
          </div>
        )}

        {!token && <p className="mt-5" role="alert">{t("m_816d2b2bbb")}</p>}
        {(!token || (message && !done)) && <Link className="text-link block mt-4" to={authLink('/forgot-password',destination)}>{t("m_0a4fecf3e2")}</Link>}
        {done && <Link className="auth-submit mt-6" to={authLink('/login',destination)}>{t("m_155b2ad461")}</Link>}
        {token && !done && <form onSubmit={submit} className="auth-form">
          <div>
            <PasswordField
              id="new-password" name="password" label={t("m_515e9c7cf7")} required autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("m_fdc71c9618")}
            />
            <PasswordRules password={password} />
          </div>

          <PasswordField
            id="confirm-password" name="confirmPassword" label={t("m_6fde05a916")} required autoComplete="new-password" value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onBlur={() => setConfirmTouched(true)}
            error={mismatch ? t("m_9daceebc80") : undefined}
            placeholder={t("m_b3c58fe4d4")}
          />

          <button
            type="submit"
            disabled={loading}
            className="auth-submit disabled:opacity-60"
          >
            {loading ? t("m_9be1af6abe") : t("m_d70928debc")}
          </button>
        </form>}
    </AuthShell>
  );
}
