import { useI18n } from '../i18n';
import { FormInput } from '../components/FormInput';
import { ActionProgress, waitActionSuccess } from '../components/ActionProgress';
import { FormEvent, useEffect, useState } from 'react';
import {authLink, loginDestination} from '../lib/loginDestination';
import { useSearchParams } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { api } from '../lib/api';
import { AuthShell } from '../components/AuthShell';

const RESEND_SECONDS = 60;

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const destination = loginDestination(params.get('redirect'));
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [serverMessage, setServerMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const request = async (address: string) => {
    setLoading(true);
    setCompleted(false);
    setError('');

    try {
      const res = await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: address, return_to: destination }),
      });

      setCompleted(true);
      await waitActionSuccess();

      setServerMessage(res.message || t("m_5b07d704ed"));
      setSentTo(address);
      setCooldown(RESEND_SECONDS);
    } catch (err: any) {
      setError(err.message || t("m_c57c7ed1ca"));
    } finally {
      setLoading(false);
      setCompleted(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address) {
      setError(t("m_efc438ac6f"));
      return;
    }
    await request(address);
  };

  return (
    <AuthShell formTitle={t("m_d832a97894")} formDescription={t("m_29034e208c")}
      alternatePrompt="" alternateLabel={t("m_747b0f9082")} alternateTo={authLink('/login', destination)}>
        {error && (
          <div className="auth-message is-error" role="alert">
            {t(error || '')}
          </div>
        )}

        {sentTo ? (
          <section className="auth-sent" aria-labelledby="recovery-sent-title" role="status">
            <h2 id="recovery-sent-title">{t("m_c3bfbdbf5f")}</h2>
            <p>{serverMessage}</p>
            <p>{t("m_2307df26f1")} <strong>{sentTo}</strong>{t("m_9f62a83d19")}</p>
            <div className="inline-actions">
              <button type="button" className="auth-secondary" disabled={loading || cooldown > 0} onClick={() => void request(sentTo)}>
                {loading && <ActionProgress success={completed} />}{completed ? t("m_60823aaec7") : loading ? t("m_364970d816") : cooldown > 0 ? t("m_9b693f7b43", {v0: cooldown}) : t("m_9287ac799e")}
              </button>
              <button type="button" className="auth-secondary" onClick={() => { setSentTo(''); setError(''); }}>{t("m_5eb350efbf")}</button>
            </div>
          </section>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <div className="auth-field">
              <div className="auth-field-label">
                <label htmlFor="recovery-email">{t("m_73075237fd")}</label>
              </div>
              <div className="auth-field-control">
                <Mail aria-hidden="true" />
                <FormInput
                  id="recovery-email" name="email" required autoComplete="email" inputMode="email" autoCapitalize="none"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  type="email"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="auth-submit disabled:opacity-60"
            >
              {loading && <ActionProgress success={completed} />}{completed ? t("m_60823aaec7") : loading ? t("m_9d2ee1e4d8") : t("m_5bc3a26905")}
            </button>
          </form>
        )}
    </AuthShell>
  );
}
