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
};
export function AdminWeatherCompanionSettings() {
  const { locale,  t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [emotionId, setEmotionId] = useState('10');
  const [days, setDays] = useState('1');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function load() {
    try {
      const response = await api('/admin/weather-companion');
      setSettings(response.data);
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
      setMessage(error.message || t("m_f42a1238b4")); notify.error(error.message || t("m_f42a1238b4"));
    } finally {
      setBusy(false);
    }
  }
  const active =
    settings?.override && Date.parse(settings.override.endsAt) > Date.now()
      ? settings.override
      : null;
  return (
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
  );
}
