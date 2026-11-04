import { useI18n } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeading, SitePage } from '../components/ContentUI';
import config from '../../../server/src/config/mail-client.json';
import '../../styles/mail-setup.css';

function emailAddress(value: string) {
  const parts = value.split('@');
  if (value.length > 254 || /[\x00-\x20\x7f]/.test(value) || parts.length !== 2 || parts[1].toLowerCase() !== config.domain || parts[0].length > 64 || !new RegExp(config.localPartPattern).test(parts[0])) return '';
  return `${parts[0]}@${config.domain}`;
}
export default function MailSetupPage() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [input, setInput] = useState(() => emailAddress(searchParams.get('email') || '')), [status, setStatus] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [download, setDownload] = useState('');
  const [fallback, setFallback] = useState('');
  const manualCopy = useRef<HTMLTextAreaElement>(null), controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (fallback) { manualCopy.current?.focus(); manualCopy.current?.select(); } }, [fallback]);
  useEffect(() => { if (!download) return; const timer = window.setTimeout(() => { setDownload(''); setStatus(t("m_afcd233f8e")); }, 110000); return () => clearTimeout(timer); }, [download]);
  const email = emailAddress(input);
  const invalid = input !== '' && !email;
  const parameters = t("m_b3e79af5a1", {v0: config.displayName, v1: email, v2: config.imap.host, v3: config.imap.port, v4: config.smtp.host, v5: config.smtp.port});
  async function copy(value: string) {
    setFallback('');
    try { await navigator.clipboard.writeText(value); setStatus(t("m_591b281ea7")); }
    catch { setFallback(value); setStatus(t("m_7d28faa06c")); }
  }
  async function generate() {
    if (!email) { setError(t("m_0a28cf806a")); return; }
    setBusy(true); setError(''); setDownload('');
    const request = new AbortController(); controller.current = request;
    const timer = window.setTimeout(() => request.abort(), 15000);
    try {
      const response = await fetch('/api/mail-setup/profile', { method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: request.signal,
        headers: { 'Content-Type': 'text/plain', 'X-Requested-With': 'XMLHttpRequest' }, body: email });
      if (!response.ok) throw new Error(t("m_2131144a06"));
      const result = await response.json();
      if (typeof result.download !== 'string' || !/^\/api\/mail-setup\/profile\/[a-f0-9]{64}\.mobileconfig$/.test(result.download)) throw new Error(t("m_1d08d48779"));
      setDownload(result.download); setStatus(t("m_c53c7a8f4e"));
    } catch (e) { setError(e instanceof Error && e.name !== 'AbortError' ? e.message : t("m_f795a47263")); }
    finally { clearTimeout(timer); setBusy(false); }
  }
  return <SitePage narrow>
    <PageHeading eyebrow="mooncci / Mail" title={t("m_31bebb78e2")}>
      <p>{t("m_84fe7227a5")} {config.displayName}  {t("m_2704328341")}</p>
    </PageHeading>
    <div className="mail-setup">
      <section aria-labelledby="mail-address-heading">
        <h2 id="mail-address-heading">{t("m_27558ddc98")}</h2>
        <label htmlFor="mail-address">{t("m_98890631b8")}</label>
        <input id="mail-address" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={254}
          placeholder="mooncci@mooncci.site" value={input} disabled={busy} aria-invalid={invalid} aria-describedby="mail-address-help"
          onChange={e => { setInput(e.target.value); setDownload(''); setStatus(''); setError(''); setFallback(''); }} />
        <p id="mail-address-help" className="muted">{t("m_687cf9477e")}{config.domain}{t("m_230fc12654")}</p>
        {invalid && <p role="alert">{t("m_06e19c6f7f")}</p>}
      </section>
      <section aria-labelledby="mail-parameters-heading">
        <h2 id="mail-parameters-heading">{t("m_72251455f2")}</h2>
        <div className="mail-server-grid">
          {[[t("m_310e72658c"), config.imap, t("m_4f3be86b7b")], [t("m_99a58c3497"), config.smtp, t("m_4f3be86b7b")]].map(([title, settings, tls]) => {
            const server = settings as typeof config.imap;
            return <div className="mail-server" key={String(title)}><h3>{String(title)}</h3><dl>
              <dt>{t("m_2388cbc6a4")}</dt><dd>{server.host}</dd><dt>{t("m_e71ac32b54")}</dt><dd>{server.port}</dd><dt>{t("m_320c254572")}</dt><dd>{String(tls)}</dd>
              <dt>{t("m_d2d648bd1c")}</dt><dd>{t("m_de3529d004")}</dd></dl>
              <button className="quiet-button" onClick={() => copy(server.host)}>{t("m_63d90d9773")}{String(title).startsWith('IMAP') ? t("m_f1fe2008f3") : t("m_d5f01fb344")}{t("m_2388cbc6a4")}</button>
            </div>;
          })}
        </div>
        <p>{t("m_e615db8085")}<strong className="mail-username">{email || t("m_f80f3c53a5")}</strong>{t("m_7731543c73")}</p>
        <div className="inline-actions"><button className="quiet-button" disabled={!email} onClick={() => copy(email)}>{t("m_ac859f1f27")}</button><button className="quiet-button" disabled={!email} onClick={() => copy(parameters)}>{t("m_457b9f6325")}</button></div>
        <p role="status" aria-live="polite">{status}</p>
        {fallback && <textarea aria-label={t("m_4f5abe5e91")} ref={manualCopy} value={fallback} readOnly rows={8} />}
      </section>
      <section aria-labelledby="mail-clients-heading">
        <h2 id="mail-clients-heading">{t("m_35f6f62a31")}</h2>
        <details open><summary>Thunderbird</summary><ol><li>{t("m_f36ef4dd76")}</li><li>{t("m_306dec88d4")}</li><li>{t("m_4d099eca5d")}</li></ol></details>
        <details open><summary>{t("m_27de782a98")}</summary>
          <p>{t("m_88dfb037a5")}</p>
          <ol><li>{t("m_def9915a27")}</li><li>{t("m_f7911af15c")}</li><li>{t("m_e512d82ffc")}</li><li>{t("m_32aeafeee5")} {config.imap.port}{t("m_326fafce9d")} {config.smtp.port}  {t("m_f3c3f5b7b1")}</li></ol>
          <p className="muted">{t("m_9240159b57")}</p>
          <div className="inline-actions"><button className="quiet-button" disabled={!email || busy} onClick={generate}>{busy ? t("m_a8b8730c96") : t("m_02983d3ca3")}</button>
            {download && <a className="quiet-button" href={download} referrerPolicy="no-referrer">{t("m_22e2709267")}</a>}</div>
          {error && <p role="alert">{t(error || '')}</p>}
        </details>
        <details open><summary>Gmail · iOS / Android</summary><ol><li>{t("m_ceb00d31dc")}</li><li>{t("m_a703fe6aa1")} {config.imap.host}{t("m_a2c8401e16")} {config.imap.port}，SSL/TLS。</li><li>{t("m_e81acfcc02")} {config.smtp.host}{t("m_a2c8401e16")} {config.smtp.port}{t("m_bc2bc3f018")}</li></ol><p>{t("m_200d1cf37a")}</p></details>
        <details><summary>{t("m_5e5f67146a")}</summary><p>{t("m_653b05e7bf")}</p></details>
      </section>
    </div>
  </SitePage>;
}
