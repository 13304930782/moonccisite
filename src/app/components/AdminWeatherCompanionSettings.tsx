import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { ThemeSelect } from './ThemeSelect';
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
      setMessage(error.message || '小球设置读取失败');
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
      setMessage(
        event
          ? '已设置；已打开的前台页面会在一分钟内更新。'
          : '已恢复根据访客所选城市的天气决定心情。',
      );
    } catch (error: any) {
      setMessage(error.message || '保存失败，请重试');
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
        <h2>天气小球</h2>
        <p>
          默认跟随访客所选城市的天气。临时指定心情后，到期自动恢复天气模式。
        </p>
      </div>
      <fieldset disabled={busy || !settings}>
        <p className="settings-hint">
          {active
            ? `当前手动状态：${active.name}，持续至 ${new Date(active.endsAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京时间）。`
            : '当前根据访客所选城市的当日天气自动选择原版表情。'}
        </p>
        <div className="settings-two-columns">
          <label className="settings-field">
            <span>临时心情</span>
            <ThemeSelect
              value={emotionId}
              onValueChange={setEmotionId}
              aria-label="临时心情"
            >
              {(settings?.moods || []).map((mood) => (
                <option key={mood.emotionId} value={mood.emotionId}>
                  {mood.name}
                </option>
              ))}
            </ThemeSelect>
          </label>
          <label className="settings-field">
            <span>持续天数</span>
            <input
              aria-label="持续天数"
              type="number"
              min="1"
              max="365"
              step="1"
              required
              value={days}
              onChange={(event) => setDays(event.target.value)}
            />
            <small>默认 1 天，从保存时起算 24 小时；再次保存会重新计时。</small>
          </label>
        </div>
        <div className="settings-save">
          <button type="submit" className="button-primary">
            {busy ? '保存中…' : '设置小球心情'}
          </button>
          <button
            type="button"
            className="quiet-button"
            onClick={() => save()}
            disabled={!active}
          >
            恢复天气模式
          </button>
        </div>
      </fieldset>
      {message && (
        <p role="status">
          {message}
          {!settings && (
            <button type="button" className="quiet-button" onClick={load}>
              重新读取
            </button>
          )}
        </p>
      )}
    </form>
  );
}
