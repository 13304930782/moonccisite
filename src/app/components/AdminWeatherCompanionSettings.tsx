import { useI18n } from '../i18n';
import { notify } from '../lib/feedback';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from './ui/dropdown-menu';
import '../../styles/language-switch.css';
type Override = {
  emotionId: string;
  name: string;
  durationDays: number;
  endsAt: string;
};
type Settings = {
  override: Override | null;
  moods: { emotionId: string; name: string }[];
  status?: { text: string; endsAt: string } | null;
};
export function AdminWeatherCompanionSettings() {
  const { locale,  t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [emotionId, setEmotionId] = useState('10');
  const [days, setDays] = useState('1');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Settings['status']>(null);
  const [statusText, setStatusText] = useState('');
  const [statusEnd, setStatusEnd] = useState<'tonight' | '24h'>('tonight');
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState('');
  async function load() {
    try {
      const response = await api('/admin/weather-companion');
      setSettings(response.data);
      setStatus(response.data.status || null);
      setStatusText(response.data.status?.text || '');
      if (response.data.override) {
        setEmotionId(response.data.override.emotionId);
        setDays(String(response.data.override.durationDays));
      }
      setMessage('');
    } catch (error: any) {
      setMessage(error.message || t("m_3b29c9882b"));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!status?.endsAt) return;
    const delay = Date.parse(status.endsAt) - Date.now();
    if (delay <= 0) { setStatus(null); return; }
    const timer = setTimeout(() => setStatus(null), Math.min(delay, 2147483647));
    return () => clearTimeout(timer);
  }, [status]);
  async function save(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await api('/admin/weather-companion', {
        method: event ? 'PUT' : 'DELETE',
        ...(event
          ? { body: JSON.stringify({ emotionId, durationDays: Number(days) }) }
          : {}),
      });
      setSettings(response.data);
      notify.success(event
          ? t("m_fbc4006266")
          : t("m_1fe9c135d6"));
    } catch (error: any) {
      setMessage(error.message || t("m_f42a1238b4"));
    } finally {
      setBusy(false);
    }
  }
  const active =
    settings?.override && Date.parse(settings.override.endsAt) > Date.now()
      ? settings.override
      : null;
  const activeStatus = status && Date.parse(status.endsAt) > Date.now() ? status : null;
  async function saveStatus(clear = false) {
    const text = statusText.trim();
    if (!clear && !text) { setStatusError(t('请输入今天在写什么。')); return; }
    setStatusBusy(true);
    setStatusError('');
    try {
      const now = Date.now();
      const beijing = new Date(now + 8 * 3600000);
      const end = statusEnd === '24h' ? now + 24 * 3600000 : Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), beijing.getUTCDate() + 1) - 8 * 3600000;
      const response = await api('/admin/weather-companion/status', {
        method: clear ? 'DELETE' : 'PUT',
        ...(!clear ? { body: JSON.stringify({ text, endsAt: new Date(end).toISOString() }) } : {}),
      });
      setStatus(response.data.status);
      setStatusText(clear ? '' : text);
      notify.success(t(clear ? '状态已清空' : '状态已保存'));
    } catch (error: any) {
      setStatusError(error.message || t('状态保存失败，请重试。'));
    } finally { setStatusBusy(false); }
  }
  return (
    <>
    <form id="weather-companion" className="settings-section" onSubmit={save}>
      <div className="settings-section-heading">
        <h2>{t("m_acf6ef3f39")}</h2>
        <p>
           {t("m_ffd3eb05c4")} </p>
      </div>
      <fieldset disabled={busy || !settings}>
        <p className="settings-hint">
          {active
            ? t("m_96fb48c6d1", {v0: active.name, v1: new Date(active.endsAt).toLocaleString(locale, { timeZone: 'Asia/Shanghai', hour12: false })})
            : t("m_7c1c29316e")}
        </p>
        <div className="settings-two-columns">
          <label className="settings-field">
            <span>{t("m_b45dbba5df")}</span>
            <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="language-trigger weather-mood-trigger" disabled={busy||!settings} aria-label={t("m_b45dbba5df")}><span>{t(settings?.moods.find(m=>m.emotionId===emotionId)?.name||'')}</span><ChevronDown size={16} aria-hidden="true"/></button></DropdownMenuTrigger>
              <DropdownMenuContent className="language-menu weather-mood-menu" align="start" sideOffset={6}><DropdownMenuRadioGroup value={emotionId} onValueChange={setEmotionId}>
                {(settings?.moods||[]).map(mood=><DropdownMenuRadioItem key={mood.emotionId} value={mood.emotionId}>{t(mood.name)}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup></DropdownMenuContent>
            </DropdownMenu>
          </label>
          <label className="settings-field">
            <span>{t("m_8435f893fe")}</span>
            <input
              aria-label={t("m_8435f893fe")}
              type="number"
              min="1"
              max="365"
              step="1"
              required
              value={days}
              onChange={(event) => setDays(event.target.value)}
            />
            <small>{t("m_e67afad6f8")}</small>
          </label>
        </div>
        <div className="settings-save">
          <button type="submit" className="button-primary">
            {busy ? t("m_ff509c9ba0") : t("m_036ab17365")}
          </button>
          <button
            type="button"
            className="quiet-button"
            onClick={() => save()}
            disabled={!active}
          >
             {t("m_ed3ed9aceb")} </button>
        </div>
      </fieldset>
      {message && (
        <p role="status">
          {t(message || '')}
          {!settings && (
            <button type="button" className="quiet-button" onClick={load}>
               {t("m_df7392cc96")} </button>
          )}
        </p>
      )}
    </form>
    <form id="weather-companion-status" className="settings-section" onSubmit={(event) => { event.preventDefault(); void saveStatus(); }}>
      <div className="settings-section-heading"><h2>{t('今天在写什么')}</h2><p>{t('小球会在闲置时偶尔说出这句话。')}</p></div>
      <fieldset disabled={statusBusy || !settings}>
        <div className="companion-status-current"><span>{t('当前状态')}</span><strong>{activeStatus ? activeStatus.text : t('当前没有状态')}</strong>{activeStatus && <small>{t('到期')} {new Date(activeStatus.endsAt).toLocaleString(locale, { timeZone: 'Asia/Shanghai', hour12: false })} · {t('北京时间')}</small>}</div>
        <label className="settings-field"><span className="companion-status-label">{t('状态内容')} <small>{statusText.length} / 40</small></span><input type="text" maxLength={40} value={statusText} onChange={(event) => setStatusText(event.target.value)} placeholder={t('例如：在改小球的气泡')} /></label>
        <div className="settings-field"><span>{t('结束时间')}</span><DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="language-trigger weather-mood-trigger" aria-label={t('结束时间')}><span>{t(statusEnd === 'tonight' ? '今晚 24:00（北京时间）' : '24 小时后')}</span><ChevronDown size={16} aria-hidden="true" /></button></DropdownMenuTrigger><DropdownMenuContent className="language-menu weather-mood-menu" align="start" sideOffset={6}><DropdownMenuRadioGroup value={statusEnd} onValueChange={(value) => setStatusEnd(value as 'tonight' | '24h')}><DropdownMenuRadioItem value="tonight">{t('今晚 24:00（北京时间）')}</DropdownMenuRadioItem><DropdownMenuRadioItem value="24h">{t('24 小时后')}</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
        {statusError && <p className="companion-status-error" role="alert">{statusError}</p>}
        <div className="settings-save"><button type="submit" className="button-primary">{statusBusy ? t('保存中…') : t('保存状态')}</button><button type="button" className="quiet-button" onClick={() => void saveStatus(true)} disabled={!activeStatus}>{t('清空')}</button></div>
      </fieldset>
    </form>
    </>
  );
}
