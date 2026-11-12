import { useI18n } from '../i18n';
import { FormInput } from '../components/FormInput';
import { ActionProgress, waitActionSuccess } from '../components/ActionProgress';
import {authLink, loginDestination} from '../lib/loginDestination';
import { ArrowRight, Mail, User } from 'lucide-react';
import { PasswordField, PasswordRules } from '../components/PasswordField';
import { passwordProblem } from '../lib/passwordRules';
import { notify } from '../lib/feedback';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { SocialLoginButtons } from '../components/SocialLoginButtons';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { t } = useI18n();
  const { register, googleLogin, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const destination = loginDestination(params.get('redirect'));
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);

  const [confirmTouched, setConfirmTouched] = useState(false);
  const mismatch = confirmTouched && confirmPassword !== '' && password !== confirmPassword;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !email.trim() || !password || !confirmPassword) {
      return setMessage(t("m_507670533c"));
    }
    const problem = passwordProblem(password);
    if (problem) return setMessage(problem);
    if (password !== confirmPassword) { setConfirmTouched(true); return setMessage(t("m_5880774570")); }

    setLoading(true);
    setCompleted(false);
    setMessage('');

    try {
      await register(username.trim(), email.trim(), password);
      setCompleted(true);
      await waitActionSuccess();
      if(!mounted.current)return;
      notify.success(t("m_98d83fcec5"));
      navigate(authLink('/login', destination), {replace:true});
    } catch (err: any) {
      if(mounted.current)setMessage(err.message || t("m_6d57824e03"));
    } finally {
      if(mounted.current)setLoading(false);
    }
  };

  const signUpWithGoogle = async (credential: string) => {
    setLoading(true);
    setMessage('');

    try {
      const user = await googleLogin(credential,destination);
      navigate(
        destination || (['owner', 'admin', 'editor'].includes(user.role) ? '/admin' : '/'),
      );
    } catch (err: any) {
      setMessage(err.message || t("m_a228b3f9eb"));
    } finally {
      setLoading(false);
    }
  };

  if (authLoading)
    return (
      <p className="quiet-state" role="status">
         {t("m_a51656deb6")} </p>
    );
  if (user) return <Navigate to={destination || "/"} replace />;

  return (
    <AuthShell
      index="02 / 02"
      modeLabel="NEW MEMBER"
      storyTitle={
        <>
           {t("m_651aacde4d")} <br />
           {t("m_c254cc4782")} </>
      }
      storyDescription={t("m_99d460dca1")}
      formTitle={t("m_679e917b16")}
      formDescription={t("m_abeb3d92f7")}
      alternatePrompt={t("m_5d3598cbd8")}
      alternateLabel={t("m_dd388142a5")}
      alternateTo={authLink('/login', destination)}
    >
      {message && (
        <div className="auth-message is-error" role="alert">
          {t(message || '')}
        </div>
      )}

      <form onSubmit={submit} className="auth-form">
        <div>
          <label htmlFor="username" className="auth-field-label">
             {t("m_1a3f0617d6")} </label>
          <div className="auth-field-control">
            <User aria-hidden="true" />
            <FormInput
              type="text"
              name="username"
              id="username"
              required
              minLength={2}
              maxLength={30}
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t("m_49a731ce15")}
            />
          </div>
        </div>

        <div>
          <label htmlFor="register-email" className="auth-field-label">
             {t("m_73075237fd")} </label>
          <div className="auth-field-control">
            <Mail aria-hidden="true" />
            <FormInput
              type="email"
              name="email"
              id="register-email"
              required
              maxLength={254}
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              validateOnBlur
              placeholder="name@example.com"
            />
          </div>
        </div>

        <div>
          <PasswordField
            id="new-password"
            name="password"
            label={t("m_a621ab606d")}
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("m_0894775633")}
          />
          <PasswordRules password={password} />
        </div>

        <PasswordField
          id="confirm-password"
          name="confirmPassword"
          label={t("m_81b17bc0c3")}
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          onBlur={() => setConfirmTouched(true)}
          error={mismatch ? t("m_9daceebc80") : undefined}
          placeholder={t("m_d0c9a0e810")}
        />

        <button
          type="submit"
          disabled={loading}
          className="neo-button neo-button-dark auth-submit disabled:opacity-60"
        >
          {loading && <ActionProgress success={completed} />}{completed ? t("m_053461ce86") : loading ? t("m_bda8d590a9") : t("m_f48d12cf53")}
          {!loading && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
        </button>
      </form>

      <SocialLoginButtons returnTo={destination || "/"}
        context="signup"
        disabled={loading}
        onCredential={signUpWithGoogle}
        onError={setMessage}
      />
    </AuthShell>
  );
}
