import { useI18n } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {Link} from '../components/LocaleLink';
import { CheckCircle2, Mail, CircleAlert } from 'lucide-react';
import '../../styles/workflow-feedback.css';
import { api } from '../lib/api';
import { PageHeading, SitePage } from '../components/ContentUI';
export default function SubscriptionPage() {
  const { t } = useI18n();
  const { action } = useParams();
  const location = useLocation();
  const [token, setToken] = useState(() => window.location.hash.slice(1));
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [message, setMessage] = useState('');
  const result = useRef<HTMLHeadingElement>(null);
  const confirming = action === 'confirm';
  const valid = ['confirm', 'unsubscribe'].includes(action || '') && /^[a-f0-9]{64}$/.test(token);
  useEffect(() => {
    if (!location.hash) return;
    setToken(location.hash.slice(1)); setDone(false); setMessage('');
    history.replaceState(history.state, '', window.location.pathname);
  }, [location.hash]);
  useEffect(() => { if (done) result.current?.focus(); }, [done]);
  async function submit() {
    if (busy || done) return;
    setBusy(true); setMessage('');
    try {
      const r = await api(`/subscriptions/${action}`, { method: 'POST', body: JSON.stringify({ token }) });
      setMessage(r.message); setDone(true);
    } catch (e: any) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  return <SitePage narrow>
    <div className="workflow-feedback subscription-feedback">
      <PageHeading eyebrow={t("m_5a3e8957f4")} title={done ? (confirming ? t("m_9ba1c982f0") : t("m_0d35593734")) : (confirming ? t("m_2e47385c6e") : t("m_8066d66dc9"))} />
      {done ? <section className="workflow-result" aria-label={t("m_f62360f6e5")}>
        <CheckCircle2 size={28} aria-hidden="true" />
        <div className="workflow-result-body">
          <h2 ref={result} tabIndex={-1}>{confirming ? t("m_968f579b5e") : t("m_9424c40cfc")}</h2>
          <p>{t(message || '')}</p>
          {confirming && <p>{t("m_83f91c0be6")}</p>}
          <div className="subscription-actions"><Link className="workflow-button workflow-primary" to="/updates">{t("m_be86244fc1")}</Link>{confirming && <Link className="workflow-button" to="/#subscribe">{t("m_4631b7aa7c")}</Link>}<a className="workflow-button" href="mailto:support@mooncci.site">{t("m_4cac90c805")}</a><Link className="workflow-button" to="/">{t("m_d66f4359da")}</Link></div>
        </div>
      </section> : !valid ? <section className="workflow-result" role="alert">
        <CircleAlert size={24} aria-hidden="true" /><div className="workflow-result-body"><h2>{t("m_1a3848b082")}</h2><p>{t("m_80c2f70a61")}</p><div className="subscription-actions">{confirming && <Link className="workflow-button workflow-primary" to="/#subscribe">{t("m_4631b7aa7c")}</Link>}<a className="workflow-button" href="mailto:support@mooncci.site">{t("m_4cac90c805")}</a><Link className="workflow-button" to="/">{t("m_d66f4359da")}</Link></div></div>
      </section> : <section className="workflow-result">
        <Mail size={24} aria-hidden="true" /><div className="workflow-result-body">
          <h2>{confirming ? t("m_64957a43a0") : t("m_735aa4cfbe")}</h2>
          <p>{confirming ? t("m_f78273a5a9") : t("m_37679996e5")}</p>
          {message && <p role="alert" className="subscription-error"><CircleAlert size={18} aria-hidden="true" />{t(message || '')}</p>}{message && confirming && <Link className="workflow-button" to="/#subscribe">{t("m_4033e1b4d5")}</Link>}
          <div className="subscription-actions"><button className="workflow-button workflow-primary" disabled={busy} onClick={submit}>{busy ? t("m_574ec7517d") : confirming ? t("m_9a392ccb84") : t("m_6f78b141e8")}</button><Link className="workflow-button" to="/">{confirming ? t("m_ae963c300e") : t("m_922c6e73fd")}</Link></div>
        </div>
      </section>}
    </div>
  </SitePage>;
}
