import { useI18n } from '../i18n';
import { ThemeSelect } from '../components/ThemeSelect';
import { useEffect, useState } from 'react';

import {Link} from '../components/LocaleLink';
import { SitePage } from '../components/ContentUI';
import { SiteBack } from '../components/SiteBack';
import { clearDiagnostics, diagnosticState, exportDiagnostics, startDiagnostics, stopDiagnostics, subscribeDiagnostics } from '../lib/browserDiagnostics';
import '../../styles/diagnostics.css';

export default function DiagnosticsPage() {
  const { locale,  t } = useI18n();
  const [, update] = useState(0);
  const [mode, setMode] = useState<'relay-on' | 'relay-off' | 'unknown'>('relay-on');
  const [notice, setNotice] = useState('');
  useEffect(() => subscribeDiagnostics(() => update(n => n + 1)), []);
  const session = diagnosticState();
  function download() {
    const url = URL.createObjectURL(new Blob([exportDiagnostics()], { type:'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `mooncci-diagnostics-${session?.mode || 'unknown'}-${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000); setNotice(t("m_f2e2ac2976"));
  }
  return <SitePage narrow><section className="diagnostics-page">
    <SiteBack />
    <header><p className="eyebrow">{t("m_110dee48f8")}</p><h1>{t("m_7646214e20")}</h1><p className="muted">{t("m_095b19d2ba")}</p></header>
    <div className="diagnostics-panel">
      <label htmlFor="diagnostic-mode">{t("m_ccdfe35df8")}</label>
      <ThemeSelect aria-label={t("m_ccdfe35df8")} id="diagnostic-mode" value={mode} disabled={session?.active} onValueChange={value => setMode(value as typeof mode)}>
        <option value="relay-on">{t("m_ffb0d8d39b")}</option><option value="relay-off">{t("m_c519f0e4ff")}</option><option value="unknown">{t("m_6d39581d48")}</option>
      </ThemeSelect>
      <p className="muted">{t("m_1348e078a6")}</p>
      <div className="diagnostics-actions">
        <button className="quiet-button" disabled={session?.active} onClick={() => { startDiagnostics(mode); setNotice(t("m_7983b1d028")); }}>{t("m_1ae8ad25e4")}</button>
        <button className="quiet-button" disabled={!session?.active} onClick={stopDiagnostics}>{t("m_283a5893e4")}</button>
        <button className="quiet-button" disabled={!session?.rows.length} onClick={download}>{t("m_a74ce7c725")}</button>
        <button className="quiet-button" disabled={!session} onClick={() => { clearDiagnostics(); setNotice(t("m_8a43510069")); }}>{t("m_c7b8aba1d1")}</button>
      </div>
      <p role="status">{session?.active ? t("m_40291bdda3") : t("m_ad5d5fc779")} · {session?.rows.length || 0}  {t("m_f004f1d84c")}{session?.active && t("m_17a96f473c", {v0: new Date(session.expires).toLocaleTimeString(locale,{timeZone:'Asia/Shanghai'})})}</p>
      {notice && <p role="status">{notice}</p>}
    </div>
    <div className="diagnostics-panel"><h2>{t("m_0e4783c62c")}</h2>
      <p>{t("m_4fec18bef5")}</p>
      <nav className="diagnostics-actions" aria-label={t("m_274da33fd3")}><Link to="/">{t("m_203c08e0d4")}</Link><Link to="/articles">{t("m_62e223f320")}</Link><Link to="/projects">{t("m_37a3a79686")}</Link><Link to="/account/mailbox">{t("m_2d7256702a")}</Link></nav>
      <p className="muted">{t("m_aa5894d2af")}</p>
    </div>
    {!!session?.rows.length && <div className="diagnostics-panel"><h2>{t("m_017a5a89ff")}</h2><ol className="diagnostics-records">{session.rows.slice(-20).reverse().map((row, i) => <li key={i}><span>{row.type} · {row.path}</span><strong>{typeof row.duration_ms === 'number' ? `${row.duration_ms} ms` : t("m_22eafd31f7")}</strong></li>)}</ol></div>}
  </section></SitePage>;
}
