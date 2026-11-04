import { useI18n } from '../i18n';
import { notify } from '../lib/feedback';
import { confirmAction } from '../lib/confirmAction';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { maskedSubscription } from '../lib/electricityPresentation';

export function ElectricityRssSubscription({roomId}: {roomId: string}) {
  const {user} = useAuth();
  return user ? <RoomElectricityRssSubscription key={`${user.id}:${roomId}`} roomId={roomId}/> : null;
}
function RoomElectricityRssSubscription({roomId}: {roomId: string}) {
  const { t } = useI18n();
  const [data, setData] = useState<{url: string | null; resetRequired: boolean} | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [shown, setShown] = useState(false);
  const inFlight = useRef(false), alive = useRef(true);
  useEffect(() => {
    alive.current = true; const controller = new AbortController();
    api(`/electricity/rss/subscription?roomId=${encodeURIComponent(roomId)}`, {cache: 'no-store', signal: controller.signal})
      .then(response => {if (!controller.signal.aborted) setData(response.data);})
      .catch(() => {if (!controller.signal.aborted) setError(t("m_568270c1ad"));})
      .finally(() => {if (!controller.signal.aborted) setBusy(false);});
    return () => {alive.current = false; controller.abort();};
  }, [roomId]);
  async function request(action: 'create' | 'reset' | 'read') {
    if (inFlight.current) return;
    if (action === 'reset' && !await confirmAction(t("m_37b4996a8d"), t("m_13a5bb3668"))) return;
    if (inFlight.current || !alive.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const response = await api(`/electricity/rss/subscription${action === 'reset' ? '/reset' : ''}?roomId=${encodeURIComponent(roomId)}`, {method: action === 'read' ? 'GET' : 'POST', cache: 'no-store'});
      if (!alive.current) return;
      setData(response.data); setShown(false);
      if (action !== 'read') notify.success(action === 'reset' ? t("m_d2cd2e209c") : t("m_3611a663a5"));
    } catch {
      if (alive.current) {setError(t("m_98c8cbc004")); notify.error(t("m_98c8cbc004"));}
    } finally {inFlight.current = false; if (alive.current) setBusy(false);}
  }
  async function copy() {
    if (!data?.url) return;
    try {await navigator.clipboard.writeText(data.url); notify.success(t("m_8f6f8d979c"));}
    catch {notify.error(t("m_d7c4cf6ae5"));}
  }
  const glass = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = glass.current, token = data?.url?.match(/[?&]token=([^&#]*)/)?.[1];
    if (!element || token === undefined) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const context = document.createElement('canvas').getContext('2d');
      if (!context) return;
      context.font = getComputedStyle(element).font;
      element.style.width = `${context.measureText(token).width}px`;
    };
    measure();
    document.fonts.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => {active = false; window.removeEventListener('resize', measure);};
  }, [data?.url, shown]);
  const masked = maskedSubscription(data?.url);
  return <section className="elec-rss" aria-labelledby="elec-rss-title" aria-busy={busy}>
    <div className="elec-rss-head"><h2 id="elec-rss-title">{t("m_8550f5a9e7")}</h2><span>{t("m_e4e924464d")}</span></div>
    <p className="elec-rss-description">{t("m_e0af9cc5fc")}</p>
    <div className="elec-rss-controls">
      {shown && data?.url ? <input className="elec-rss-input" aria-label={t("m_efde7b1871")} readOnly autoComplete="off" spellCheck={false} value={data.url} onFocus={event => event.target.select()}/> : <div className="elec-rss-input elec-rss-masked" role="textbox" aria-readonly="true" aria-label={data?.url ? t("m_5be1964bdc") : t("m_f919959f83")} tabIndex={0}><span>{masked.before}</span><span ref={glass} className="elec-token-glass" aria-hidden="true"><span>{masked.mask}</span></span><span>{masked.after}</span></div>}
      <button className="elec-button" type="button" disabled={!data?.url || busy} aria-pressed={shown} onClick={() => setShown(value => !value)}>{shown ? t("m_145219e726") : t("m_4e1449e7d5")}</button>
      {data?.url ? <button className="elec-button elec-button-solid" type="button" disabled={busy} onClick={copy}>{t("m_1541c2076c")}</button> : <button className="elec-button elec-button-solid" type="button" disabled={busy || !data || data.resetRequired} onClick={() => request('create')}>{t("m_f5afe814f5")}</button>}
    </div>
    {busy && <p className="elec-rss-message" role="status">{t("m_2fed85be70")}</p>}
    {error && <div className="elec-rss-message" role="alert"><span>{t(error || '')}</span><button className="elec-button" disabled={busy} onClick={() => request('read')}>{t("m_df7392cc96")}</button></div>}
    {data?.resetRequired && <p className="elec-rss-message">{t("m_8010215ab7")}</p>}
    {(data?.url || data?.resetRequired) && <button className="elec-rss-reset" type="button" disabled={busy} onClick={() => request('reset')}>{t("m_13a5bb3668")}</button>}
  </section>;
}
