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
const dateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(
    value.includes('T') ? value : `${value.replace(' ', 'T')}+08:00`,
  );
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
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
      {(room) => <RoomSettings key={`${room.id}:${room.active}`} room={room} />}
    </AdminElectricityRooms>
  );
}
function RoomSettings({ room }: { room: ElectricityRoom }) {
  const roomApi = (path: string, options?: Parameters<typeof api>[1]) =>
    api(`${path}?roomId=${encodeURIComponent(room.id)}`, options);
  const [data, setData] = useState<SettingsData | null>(null);
  const [form, setForm] = useState<Config>(defaults);
  const [busy, setBusy] = useState('');
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
      setHistoryError(err instanceof Error ? err.message : '历史同步失败。');
    } finally {
      setBusy('');
    }
  };

  const load = async (resetForm = true) => {
    const response = await roomApi('/admin/electricity/settings');
    setData(response.data);
    if (resetForm) setForm({ ...defaults, ...response.data.config });
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
      setError(err instanceof Error ? err.message : '操作失败。');
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
      '设置已保存，运行计划将在 30 秒内生效。',
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
          <h2 id="electricity-current-heading">当前电量</h2>
          <span>
            {data?.current
              ? `采集于 ${dateTime(data.current.recordedAt)} · 北京时间`
              : '尚未采集数据'}
          </span>
        </div>
        <div className="electricity-manage-metrics">
          {[
            ['总余量', data?.current?.totalRemaining],
            ['自购剩余', data?.current?.purchasedRemaining],
            ['补贴剩余', data?.current?.subsidyRemaining],
            ['今日用电', data?.current?.todayUse],
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
                '电量数据已刷新。',
              )
            }
          >
            <RefreshCw
              className={busy === 'refresh' ? 'electricity-spin' : ''}
            />
            {busy === 'refresh' ? '查询中…' : '立即查询'}
          </button>
          <button
            type="button"
            className="electricity-button"
            disabled={Boolean(busy) || !ready}
            onClick={syncHistory}
          >
            <Clock3 className={busy === 'history' ? 'electricity-spin' : ''} />
            {busy === 'history' ? '同步中…' : '同步学校历史用电'}
          </button>
          <p>同步最近 7 个完整日，间隔 15 分钟；预测仍在零点更新。</p>
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
                  运行计划
                </h2>
                <span>北京时间 · 每日重复</span>
              </div>
              <label className="electricity-switch-row">
                <span>
                  <strong>启用电量监控</strong>
                  <small>关闭后暂停自动采集</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="启用电量监控"
                  checked={form.enabled}
                  onChange={(event) =>
                    setForm({ ...form, enabled: event.target.checked })
                  }
                />
              </label>
              <div className="electricity-schedule-labels" aria-hidden="true">
                <span>运行时间</span>
                <span>执行任务</span>
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
                          日统计与历史同步
                        </span>
                        <span className="electricity-schedule-lock">固定</span>
                      </>
                    ) : (
                      <>
                        <ThemeSelect
                          aria-label={`第 ${index + 1} 行运行时间`}
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
                          aria-label={`第 ${index + 1} 行执行任务`}
                          value={row.type}
                          onValueChange={(value) =>
                            updateSchedule(index, {
                              type: value as ScheduleRow['type'],
                            })
                          }
                        >
                          <option value="collect">仅采集</option>
                          <option
                            value="morning"
                            disabled={form.schedule.some(
                              (other, i) =>
                                i !== index && other.type === 'morning',
                            )}
                          >
                            采集并生成早报
                          </option>
                          <option
                            value="evening"
                            disabled={form.schedule.some(
                              (other, i) =>
                                i !== index && other.type === 'evening',
                            )}
                          >
                            采集并生成晚报
                          </option>
                        </ThemeSelect>
                        <button
                          type="button"
                          className="electricity-schedule-remove"
                          aria-label={`删除 ${timeLabel(row.hour)} 计划`}
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
                添加时间
              </button>
              <p className="electricity-manage-help">
                零点固定保留；早报、晚报每天各最多一次。
              </p>
            </section>

            <section
              className="electricity-manage-section"
              aria-labelledby="electricity-notify-heading"
            >
              <div className="electricity-manage-heading">
                <h2 id="electricity-notify-heading">
                  <MailCheck />
                  通知与阈值
                </h2>
              </div>
              <label className="electricity-switch-row">
                <span>
                  <strong>发送早晚电量简报</strong>
                  <small>按运行计划中的早报、晚报时间发送</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="发送早晚电量简报"
                  checked={form.dailyNotify}
                  onChange={(event) =>
                    setForm({ ...form, dailyNotify: event.target.checked })
                  }
                />
              </label>
              <div className="electricity-field-grid">
                <label className="electricity-field-full">
                  <span>通知收件人</span>
                  <input
                    type="email"
                    placeholder={
                      room.legacy
                        ? '留空则使用邮件设置收件人'
                        : '留空则不发送邮件'
                    }
                    value={form.notifyTo}
                    onChange={(event) =>
                      setForm({ ...form, notifyTo: event.target.value })
                    }
                  />
                </label>
                <label>
                  <span>自购剩余警戒值 · kWh</span>
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
                  <span>总余量警戒值 · kWh</span>
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
                    '测试日报已发送。',
                  )
                }
              >
                <MailCheck />
                {busy === 'email' ? '发送中…' : '发送测试日报'}
              </button>
              <p className="electricity-manage-help">
                测试邮件使用已保存的收件人设置。
              </p>
            </section>
          </div>
          <div className="electricity-manage-save">
            <button
              type="submit"
              className="electricity-button electricity-button--primary"
            >
              <Save />
              {busy === 'save' ? '保存中…' : '保存设置'}
            </button>
            <span>修改后统一保存，运行计划在 30 秒内生效。</span>
          </div>
        </fieldset>
      </form>

      <section
        className="electricity-manage-status"
        aria-labelledby="electricity-status-heading"
      >
        <h2 id="electricity-status-heading">
          <ShieldCheck />
          服务状态
        </h2>
        <dl>
          <div>
            <dt>学校账号</dt>
            <dd>
              {!data
                ? '—'
                : data.credentials.accountConfigured
                  ? '已配置'
                  : '未配置'}
            </dd>
          </div>
          <div>
            <dt>宿舍凭据</dt>
            <dd>
              {!data
                ? '—'
                : data.credentials.roomVerifyConfigured
                  ? '已配置'
                  : '未配置'}
            </dd>
          </div>
          <div>
            <dt>最近采集成功 · 北京时间</dt>
            <dd>{dateTime(data?.state.lastSuccessAt)}</dd>
          </div>
          <div>
            <dt>电量告警</dt>
            <dd>
              {!data
                ? '—'
                : data.state.lowAlertActive
                  ? '低电量告警中'
                  : '未触发'}
            </dd>
          </div>
        </dl>
        {data?.state.lastErrorCode && (
          <p className="electricity-manage-error">
            最近错误：{data.state.lastErrorCode} ·{' '}
            {dateTime(data.state.lastErrorAt)}
          </p>
        )}
      </section>
    </div>
  );
}
