import { useI18n } from '../i18n';
import { FormInput } from '../components/FormInput';
import {authLink, loginDestination, rememberedDestination} from '../lib/loginDestination';
import { ArrowRight, CircleX, Mail } from 'lucide-react';
import { PasswordField } from '../components/PasswordField';
import { ApiError } from '../lib/api';
import { notify } from '../lib/feedback';
import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {Link} from '../components/LocaleLink';
import { AuthShell } from '../components/AuthShell';
import { SocialLoginButtons } from '../components/SocialLoginButtons';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const destination = loginDestination(params.get('redirect')) || (params.get('oauth')?rememberedDestination():'');
  const { login, googleLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(params.get('oauth') === 'email_exists' ? t("m_310262be01") : params.get('oauth') === 'failed' ? t("m_07ce307ebd") : '');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const finishLogin = (user: { role: string }) => {
    const redirect = destination;
    navigate(
      Boolean(redirect)
        ? redirect
        : ['owner', 'admin', 'editor'].includes(user.role)
          ? '/admin'
          : '/',
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setMessage('');
    setFormError('');

    try {
      const user = await login(email, password);
      finishLogin(user);
    } catch (err: any) {
      const connectionError = err instanceof ApiError &&
        (['network', 'timeout', 'format'].includes(err.kind) || err.status >= 500);
      const text = connectionError
        ? t("m_08fdd89f05")
        : err.message || t("m_ab12f29bb4");
      setFormError(text);
      if (!connectionError) document.getElementById('password')?.focus();
      if (connectionError) notify.error(err.kind === 'timeout' ? t("m_8b0e65feab") : t("m_dda1aec6b3"));
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async (credential: string) => {
    setLoading(true);
    setMessage('');

    try {
      const user = await googleLogin(credential,destination);
      finishLogin(user);
    } catch (err: any) {
      setMessage(err.message || t("m_dbd555df7e"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      index="01 / 02"
      modeLabel="MEMBER LOGIN"
      storyTitle={
        <>
           {t("m_1bc95b8b92")} <br />
           {t("m_6c2f378ba4")} </>
      }
      storyDescription={t("m_0c059f8c07")}
      formTitle={t("m_d9a999a7c8")}
      formDescription={t("m_6387df8aca")}
      alternatePrompt={t("m_23e526538b")}
      alternateLabel={t("m_5bddf41dd8")}
      alternateTo={authLink('/register', destination)}
    >
      {message && (
        <div id="login-error" className="auth-message" role="alert">
          {t(message || '')}
        </div>
      )}

      <form onSubmit={submit} className="auth-form">
        <div>
          <div className="auth-field-control floating-field floating-field--icon">
            <Mail aria-hidden="true" />
            <FormInput
              type="email"
              required
              aria-describedby={formError ? "login-form-error" : undefined}
              name="email"
              id="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(event) => { setEmail(event.target.value); setFormError(''); }}
              placeholder="name@example.com"
            />
            <label className="floating-field-label" htmlFor="email">{t("m_73075237fd")}</label>
          </div>
        </div>

        <div>
          <PasswordField
            floatingLabel
            id="password"
            name="password"
            label={t("m_a621ab606d")}
            labelAside={
              <Link to={authLink('/forgot-password', destination)} className="auth-inline-link">
                 {t("m_1d02d7f1c5")} </Link>
            }
            required
            aria-describedby={formError ? "login-form-error" : undefined}
            autoComplete="current-password"
            value={password}
            onChange={(event) => { setPassword(event.target.value); setFormError(''); }}
            placeholder={t("m_728a7b601c")}
          />
          {formError && (
            <p id="login-form-error" className="auth-form-error" role="alert">
              <CircleX size={16} aria-hidden="true" />
              <span>{t(formError || '')}</span>
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="neo-button neo-button-dark auth-submit disabled:opacity-60"
        >
          {loading ? t("m_c0b692e4f5") : t("m_a4e09c4c20")}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </form>

      <SocialLoginButtons
        returnTo={destination || '/'}
        disabled={loading}
        onCredential={signInWithGoogle}
        onError={setMessage}
      />
    </AuthShell>
  );
}
