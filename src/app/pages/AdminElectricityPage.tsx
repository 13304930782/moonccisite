import { useI18n } from '../i18n';
import '../../styles/electricity.css';
import { useUnsavedLeave } from '../lib/useUnsavedLeave';
import { ThemeSelect } from '../components/ThemeSelect';
import {
  AdminElectricityRooms,
  ElectricityRoom,
} from '../components/AdminElectricityRooms';
import { FormEvent, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MailCheck,
  RefreshCw,
  Save,
  ShieldCheck,
  Plus,
  Trash2,
  ArrowUpRight,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';

type ScheduleRow = {
  hour: number;
  type: 'daily' | 'collect' | 'morning' | 'evening';
};
type Config = {
  schedule: ScheduleRow[];
  enabled: boolean;
  dailyNotify: boolean;
  notifyHour: number;
  lowPurchaseThreshold: number;
  lowTotalThreshold: number;
  notifyTo: string;
};
type SettingsData = {
  config: Config;
  credentials: { accountConfigured: boolean; roomVerifyConfigured: boolean };
  state: {
    lastSuccessAt: string | null;
    lastErrorAt: string | null;
    lastErrorCode: string | null;
    lowAlertActive: boolean;
  };
  current: {
    todayUse: number | null;
    purchasedRemaining: number | null;
    subsidyRemaining: number | null;
    totalRemaining: number | null;
    recordedAt: string;
  } | null;
  status: string;
};

const defaults: Config = {
  schedule: [
    { hour: 0, type: 'daily' },
    { hour: 7, type: 'morning' },
    { hour: 12, type: 'collect' },
    { hour: 21, type: 'evening' },
  ],
  enabled: true,
  dailyNotify: true,
  notifyHour: 21,
  lowPurchaseThreshold: 10,
  lowTotalThreshold: 20,
  notifyTo: '',
};
const number = (value: number | null) =>
  value === null ? '—' : Number(value).toFixed(2);

const timeLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
const dateTime = (value: string | null | undefined, locale = 'zh-CN') => {
  if (!value) return '—';
  const date = new Date(
    value.includes('T') ? value : `${value.replace(' ', 'T')}+08:00`,
  );
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
};

export default function AdminElectricityPage() {
  return (
    <AdminElectricityRooms>
      {(room, onBusyChange) => <RoomSettings key={`${room.id}:${room.active}`} room={room} onBusyChange={onBusyChange} />}
    </AdminElectricityRooms>
  );
}
function RoomSettings({ room, onBusyChange }: { room: ElectricityRoom; onBusyChange: (busy: boolean) => void }) {
  const { locale,  t } = useI18n();
  const roomApi = (path: string, options?: Parameters<typeof api>[1]) =>
    api(`${path}?roomId=${encodeURIComponent(room.id)}`, options);
  const [data, setData] = useState<SettingsData | null>(null);
  const [form, setForm] = useState<Config>(defaults);
  const [saved, setSaved] = useState<Config | null>(null);
  const dirty = saved !== null && JSON.stringify(form) !== JSON.stringify(saved);
  useUnsavedLeave(dirty);
  const [busy, setBusy] = useState('');
  useEffect(() => { onBusyChange(Boolean(busy)); return () => onBusyChange(false); }, [busy, onBusyChange]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [historyMessage, setHistoryMessage] = useState('');
  const [historyError, setHistoryError] = useState('');

  const syncHistory = async () => {
    if (busy) return;
    setBusy('history');
    setHistoryMessage('');
    setHistoryError('');
    try {
      const response = await roomApi('/admin/electricity/sync-history', {
        method: 'POST',
      });
      setHistoryMessage(response.message);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : t("m_167eedc4fa"));
    } finally {
      setBusy('');
    }
  };

  const load = async (resetForm = true) => {
    const response = await roomApi('/admin/electricity/settings');
    setData(response.data);
    if (resetForm) {
      const value = { ...defaults, ...response.data.config };
      setForm(value);
      setSaved(value);
    }
  };

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  const run = async (
    name: string,
    action: () => Promise<any>,
    success: string,
  ) => {
    if (busy) return;
    setBusy(name);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
      await load(name === 'save');
    } catch (err) {
      setError(err instanceof Error ? err.message : t("m_b3b75bd055"));
    } finally {
      setBusy('');
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    run(
      'save',
      () =>
        roomApi('/admin/electricity/settings', {
          method: 'PUT',
          body: JSON.stringify(form),
        }),
      t("m_41c7fd9ce4"),
    );
  };

  const ready = Boolean(
    data?.credentials.accountConfigured &&
      data?.credentials.roomVerifyConfigured,
  );
  const updateSchedule = (index: number, patch: Partial<ScheduleRow>) => {
    setForm((current) => ({
      ...current,
      schedule: current.schedule.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  };
  const addTime = () => {
    const hour = Array.from({ length: 23 }, (_, i) => i + 1).find(
      (hour) => !form.schedule.some((row) => row.hour === hour),
    );
    if (hour !== undefined)
      setForm({
        ...form,
        schedule: [...form.schedule, { hour, type: 'collect' }],
      });
  };

  return (
    <div className="electricity-admin electricity-admin-v2">
      {(notice || error) && (
        <div
          className={`electricity-admin-notice ${error ? 'is-error' : ''}`}
          role="status"
        >
          {error ? <AlertTriangle /> : <CheckCircle2 />}
          {error || notice}
        </div>
      )}

      <section
        className="electricity-manage-overview"
        aria-labelledby="electricity-current-heading"
      >
        <div className="electricity-manage-heading">
          <h2 id="electricity-current-heading">{t("m_2686e3fd1f")}</h2>
          <span>
            {data?.current
              ? t("m_f5112fa1b8", {v0: dateTime(data.current.recordedAt,locale)})
              : t("m_2181d39595")}
          </span>
        </div>
        <div className="electricity-manage-metrics">
          {[
            [t("m_e14cbbbb24"), data?.current?.totalRemaining],
            [t("m_fe47a703f2"), data?.current?.purchasedRemaining],
            [t("m_8ed29b1286"), data?.current?.subsidyRemaining],
            [t("m_e192c06692"), data?.current?.todayUse],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <span>{label}</span>
              <strong>
                {number((value as number | null) ?? null)}
                <small>kWh</small>
              </strong>
            </div>
          ))}
        </div>
        <div className="electricity-manage-tools">
          <button
            type="button"
            className="electricity-button"
            disabled={Boolean(busy) || !ready}
            onClick={() =>
              run(
                'refresh',
                () => roomApi('/admin/electricity/refresh', { method: 'POST' }),
                t("m_b4c54e03b0"),
              )
            }
          >
            <RefreshCw
              className={busy === 'refresh' ? 'electricity-spin' : ''}
            />
            {busy === 'refresh' ? t("m_d302f90b09") : t("m_acc5822fdb")}
          </button>
          <button
            type="button"
            className="electricity-button"
            disabled={Boolean(busy) || !ready}
            onClick={syncHistory}
          >
            <Clock3 className={busy === 'history' ? 'electricity-spin' : ''} />
            {busy === 'history' ? t("m_4e2238b74e") : t("m_23fecd8c5b")}
          </button>
          <p>{t("m_cc9e39f49a")}</p>
        </div>
        {(historyMessage || historyError) && (
          <div
            className={`electricity-admin-notice ${historyError ? 'is-error' : ''}`}
            role="status"
          >
            {historyError || historyMessage}
          </div>
        )}
      </section>

      <form onSubmit={save}>
        <fieldset
          className="electricity-manage-fieldset"
          disabled={!data || Boolean(busy)}
        >
          <div className="electricity-manage-columns">
            <section
              className="electricity-manage-section"
              aria-labelledby="electricity-plan-heading"
            >
              <div className="electricity-manage-heading">
                <h2 id="electricity-plan-heading">
                  <Zap />
                   {t("m_0bf826007f")} </h2>
                <span>{t("m_43cc0bb833")}</span>
              </div>
              <label className="electricity-switch-row">
                <span>
                  <strong>{t("m_39dba20cee")}</strong>
                  <small>{t("m_2df64c1efe")}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={t("m_39dba20cee")}
                  checked={form.enabled}
                  onChange={(event) =>
                    setForm({ ...form, enabled: event.target.checked })
                  }
                />
              </label>
              <div className="electricity-schedule-labels" aria-hidden="true">
                <span>{t("m_5986e9d976")}</span>
                <span>{t("m_57b0c73f09")}</span>
                <span />
              </div>
              <div className="electricity-schedule-list">
                {form.schedule.map((row, index) => (
                  <div className="electricity-schedule-row" key={index}>
                    {row.type === 'daily' ? (
                      <>
                        <span className="electricity-schedule-fixed">
                          00:00
                        </span>
                        <span className="electricity-schedule-fixed">
                           {t("m_67c02056fc")} </span>
                        <span className="electricity-schedule-lock">{t("m_d4b3f49cd2")}</span>
                      </>
                    ) : (
                      <>
                        <ThemeSelect
                          aria-label={t("m_e130e1d08d", {v0: index + 1})}
                          value={String(row.hour)}
                          onValueChange={(value) =>
                            updateSchedule(index, {
                              hour: Number(value),
                            })
                          }
                        >
                          {Array.from({ length: 23 }, (_, i) => i + 1).map(
                            (hour) => (
                              <option
                                key={hour}
                                value={String(hour)}
                                disabled={form.schedule.some(
                                  (other, i) =>
                                    i !== index && other.hour === hour,
                                )}
                              >
                                {timeLabel(hour)}
                              </option>
                            ),
                          )}
                        </ThemeSelect>
                        <ThemeSelect
                          aria-label={t("m_49a40dfe27", {v0: index + 1})}
                          value={row.type}
                          onValueChange={(value) =>
                            updateSchedule(index, {
                              type: value as ScheduleRow['type'],
                            })
                          }
                        >
                          <option value="collect">{t("m_0447ba6a0c")}</option>
                          <option
                            value="morning"
                            disabled={form.schedule.some(
                              (other, i) =>
                                i !== index && other.type === 'morning',
                            )}
                          >
                             {t("m_3e205d8706")} </option>
                          <option
                            value="evening"
                            disabled={form.schedule.some(
                              (other, i) =>
                                i !== index && other.type === 'evening',
                            )}
                          >
                             {t("m_b1dc3f5151")} </option>
                        </ThemeSelect>
                        <button
                          type="button"
                          className="electricity-schedule-remove"
                          aria-label={t("m_94c5f96f12", {v0: timeLabel(row.hour)})}
                          onClick={() =>
                            setForm({
                              ...form,
                              schedule: form.schedule.filter(
                                (_, i) => i !== index,
                              ),
                            })
                          }
                        >
                          <Trash2 />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="electricity-button electricity-schedule-add"
                disabled={form.schedule.length >= 24}
                onClick={addTime}
              >
                <Plus />
                 {t("m_526fed2956")} </button>
              <p className="electricity-manage-help">
                 {t("m_d2c291aeed")} </p>
            </section>

            <section
              className="electricity-manage-section"
              aria-labelledby="electricity-notify-heading"
            >
              <div className="electricity-manage-heading">
                <h2 id="electricity-notify-heading">
                  <MailCheck />
                   {t("m_a45f94e638")} </h2>
              </div>
              <label className="electricity-switch-row">
                <span>
                  <strong>{t("m_a9f09d9bba")}</strong>
                  <small>{t("m_6a912e21b6")}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={t("m_a9f09d9bba")}
                  checked={form.dailyNotify}
                  onChange={(event) =>
                    setForm({ ...form, dailyNotify: event.target.checked })
                  }
                />
              </label>
              <div className="electricity-field-grid">
                <label className="electricity-field-full">
                  <span>{t("m_b836608abe")}</span>
                  <input
                    type="email"
                    placeholder={
                      room.legacy
                        ? t("m_df1e800399")
                        : t("m_d1313cca0d")
                    }
                    value={form.notifyTo}
                    onChange={(event) =>
                      setForm({ ...form, notifyTo: event.target.value })
                    }
                  />
                </label>
                <label>
                  <span>{t("m_9cd7cd5c14")}</span>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={form.lowPurchaseThreshold}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        lowPurchaseThreshold: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>{t("m_6c9221d7b2")}</span>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={form.lowTotalThreshold}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        lowTotalThreshold: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="electricity-button"
                disabled={!ready}
                onClick={() =>
                  run(
                    'email',
                    () =>
                      roomApi('/admin/electricity/test-email', {
                        method: 'POST',
                      }),
                    t("m_7dbfe669cf"),
                  )
                }
              >
                <MailCheck />
                {busy === 'email' ? t("m_364970d816") : t("m_a660b3773b")}
              </button>
              <p className="electricity-manage-help">
                 {t("m_d6af654d45")} </p>
            </section>
          </div>
          <div className="electricity-manage-save">
            <button
              type="submit"
              disabled={!dirty}
              className="electricity-button electricity-button--primary"
            >
              <Save />
              {busy === 'save' ? t("m_ff509c9ba0") : t("m_c8550237ba")}
            </button>
            <button type="button" className="electricity-button" disabled={!dirty} onClick={() => { if (saved) setForm(saved); setError(''); setNotice(''); }}>{t("m_ef804eda90")}</button>
            <span role="status">{dirty ? t("m_6265f9d3f3") : t("m_1bd91a7d0c")}{t("m_035d101488")}</span>
          </div>
        </fieldset>
      </form>

      <section
        className="electricity-manage-status"
        aria-labelledby="electricity-status-heading"
      >
        <h2 id="electricity-status-heading">
          <ShieldCheck />
           {t("m_e8a4f7c09d")} </h2>
        <dl>
          <div>
            <dt>{t("m_9a8ddf1a5e")}</dt>
            <dd>
              {!data
                ? '—'
                : data.credentials.accountConfigured
                  ? t("m_de8184da1e")
                  : t("m_80a57e03f0")}
            </dd>
          </div>
          <div>
            <dt>{t("m_ee3c2afa0b")}</dt>
            <dd>
              {!data
                ? '—'
                : data.credentials.roomVerifyConfigured
                  ? t("m_de8184da1e")
                  : t("m_80a57e03f0")}
            </dd>
          </div>
          <div>
            <dt>{t("m_b1fbb617f2")}</dt>
            <dd>{dateTime(data?.state.lastSuccessAt,locale)}</dd>
          </div>
          <div>
            <dt>{t("m_30abde581c")}</dt>
            <dd>
              {!data
                ? '—'
                : data.state.lowAlertActive
                  ? t("m_88da0a06bb")
                  : t("m_c4440e9511")}
            </dd>
          </div>
        </dl>
        {data?.state.lastErrorCode && (
          <p className="electricity-manage-error">
             {t("m_b5a4ed38fd")}{data.state.lastErrorCode} ·{' '}
            {dateTime(data.state.lastErrorAt,locale)}
          </p>
        )}
      </section>
    </div>
  );
}
