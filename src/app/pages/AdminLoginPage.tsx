import { useI18n } from '../i18n';
import { FormInput } from '../components/FormInput';
import { AuthShell } from '../components/AuthShell';
import { FormEvent, useEffect, useState } from 'react';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {Link} from '../components/LocaleLink';
import { safeRoutePath } from '../lib/safeUrl';
import { clearAuthCache } from '../lib/authToken';
import { useAuth } from '../context/AuthContext';

const DEFAULT_REDIRECT = '/admin/comments?status=pending';

export default function AdminLoginPage() {
  const { t } = useI18n();
  const { login } = useAuth();
  const [params] = useSearchParams();
  const redirect = safeAdminRedirect(params.get('redirect'));
  const ownerRequired = redirect.startsWith('/admin/early-access');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(
    ownerRequired
      ? t("m_fb8c2d81a7")
      : t("m_57ac3a7149"),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    clearAuthCache();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!email || !password) {
      setMessage(t("m_fa233796f5"));
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      clearAuthCache();

      const data = { user: await login(email, password) };

      if (!['owner', 'admin'].includes(data.user?.role)) {
        clearAuthCache();
        setMessage(
          t("m_fef870ee13"),
        );
        return;
      }

      if (ownerRequired && data.user?.role !== 'owner') {
        clearAuthCache();
        setMessage(t("m_cd90dd635f"));
        return;
      }

      const target = redirect.includes('?')
        ? `${redirect}&admin_login=${Date.now()}`
        : `${redirect}?admin_login=${Date.now()}`;

      window.location.replace(target);
    } catch (err: any) {
      setMessage(err.message || t("m_e4343921c9"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      index=""
      modeLabel=""
      storyTitle=""
      storyDescription=""
      formTitle={t("m_c454c61e78")}
      formDescription={
        ownerRequired ? t("m_7af327d229") : t("m_b065732b4b")
      }
      alternatePrompt={t("m_54c1945a1c")}
      alternateLabel={t("m_203c08e0d4")}
      alternateTo="/"
    >
      {message && (
        <p className="auth-message" role="status">
          {t(message || '')}
        </p>
      )}
      <form className="auth-form" onSubmit={submit}>
        <div>
          <label className="auth-field-label" htmlFor="review-email">
             {t("m_73075237fd")} </label>
          <div className="auth-field-control">
            <Mail />
            <FormInput
              id="review-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>
        </div>
        <div>
          <label className="auth-field-label" htmlFor="review-password">
             {t("m_a621ab606d")} </label>
          <div className="auth-field-control">
            <Lock />
            <FormInput
              id="review-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("m_728a7b601c")}
            />
          </div>
        </div>
        <button className="auth-submit" disabled={loading}>
          {loading ? t("m_3f06ed8f8c") : t("m_bdfbead84a")}
        </button>
      </form>
    </AuthShell>
  );
}

function safeAdminRedirect(input: string | null) {
  const target = safeRoutePath(input, DEFAULT_REDIRECT);

  if (target === '/admin' || target.startsWith('/admin/') || target.startsWith('/admin?')) {
    return target;
  }

  return DEFAULT_REDIRECT;
}
