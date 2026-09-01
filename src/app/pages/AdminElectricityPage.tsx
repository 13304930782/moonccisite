import { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, MailCheck, RefreshCw, Save, ShieldCheck, Zap } from 'lucide-react';
import { api } from '../lib/api';

type Config = { enabled: boolean; dailyNotify: boolean; notifyHour: number; lowPurchaseThreshold: number; lowTotalThreshold: number; notifyTo: string };
type SettingsData = {
  config: Config;
  credentials: { accountConfigured: boolean; roomVerifyConfigured: boolean };
  state: { lastSuccessAt: string | null; lastErrorAt: string | null; lastErrorCode: string | null; lowAlertActive: boolean };
  current: { todayUse: number | null; purchasedRemaining: number | null; subsidyRemaining: number | null; totalRemaining: number | null; recordedAt: string } | null;
  status: string;
};

const defaults: Config = { enabled: true, dailyNotify: true, notifyHour: 21, lowPurchaseThreshold: 10, lowTotalThreshold: 20, notifyTo: '' };
const number = (value: number | null) => value === null ? '—' : Number(value).toFixed(2);

export default function AdminElectricityPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [form, setForm] = useState<Config>(defaults);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const response = await api('/admin/electricity/settings');
    setData(response.data); setForm(response.data.config);
  };

  useEffect(() => { load().catch((err) => setError(err.message)); }, []);

  const run = async (name: string, action: () => Promise<any>, success: string) => {
    setBusy(name); setError(''); setNotice('');
    try { await action(); setNotice(success); await load(); } catch (err) { setError(err instanceof Error ? err.message : '操作失败。'); } finally { setBusy(''); }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    run('save', () => api('/admin/electricity/settings', { method: 'PUT', body: JSON.stringify(form) }), '设置已保存。');
  };

  return (
    <div className="electricity-admin">
      <header className="electricity-admin-head">
        <div><span>OWNER ONLY / UTILITIES</span><h1>水电监控设置</h1><p>控制每日采集、日报和一次性低电量告警。学校凭据只存在服务器环境变量中。</p></div>
        <a href="/electricity" target="_blank" rel="noreferrer" className="electricity-button">查看 Dashboard</a>
      </header>

      {(notice || error) && <div className={`electricity-admin-notice ${error ? 'is-error' : ''}`} role="status">{error ? <AlertTriangle /> : <CheckCircle2 />}{error || notice}</div>}

      <section className="electricity-admin-grid">
        <form className="electricity-admin-card electricity-admin-form" onSubmit={save}>
          <div className="electricity-admin-card-title"><Zap /><div><h2>运行策略</h2><p>Asia/Shanghai 业务时区</p></div></div>
          <label className="electricity-switch-row"><span><strong>启用电量监控</strong><small>关闭后调度器不再查询学校接口</small></span><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /></label>
          <label className="electricity-switch-row"><span><strong>发送每日电量简报</strong><small>当日成功发送后不会重复</small></span><input type="checkbox" checked={form.dailyNotify} onChange={(event) => setForm({ ...form, dailyNotify: event.target.checked })} /></label>
          <div className="electricity-field-grid">
            <label><span>每日发送时间（0–23 时）</span><input type="number" min="0" max="23" value={form.notifyHour} onChange={(event) => setForm({ ...form, notifyHour: Number(event.target.value) })} /></label>
            <label><span>通知收件人</span><input type="email" placeholder="留空则使用邮件设置收件人" value={form.notifyTo} onChange={(event) => setForm({ ...form, notifyTo: event.target.value })} /></label>
            <label><span>自购剩余警戒值（kWh）</span><input type="number" min="0" step="0.01" value={form.lowPurchaseThreshold} onChange={(event) => setForm({ ...form, lowPurchaseThreshold: Number(event.target.value) })} /></label>
            <label><span>总余量警戒值（kWh）</span><input type="number" min="0" step="0.01" value={form.lowTotalThreshold} onChange={(event) => setForm({ ...form, lowTotalThreshold: Number(event.target.value) })} /></label>
          </div>
          <button type="submit" className="electricity-button electricity-button--primary" disabled={Boolean(busy)}><Save />{busy === 'save' ? '保存中…' : '保存设置'}</button>
        </form>

        <div className="electricity-admin-stack">
          <section className="electricity-admin-card">
            <div className="electricity-admin-card-title"><ShieldCheck /><div><h2>服务端凭据</h2><p>真实值永不返回浏览器</p></div></div>
            <div className="electricity-credential"><span>学校账号</span><strong className={data?.credentials.accountConfigured ? 'ok' : 'missing'}>{data?.credentials.accountConfigured ? '已配置' : '未配置'}</strong></div>
            <div className="electricity-credential"><span>宿舍校验凭据</span><strong className={data?.credentials.roomVerifyConfigured ? 'ok' : 'missing'}>{data?.credentials.roomVerifyConfigured ? '已配置' : '未配置'}</strong></div>
          </section>
          <section className="electricity-admin-card">
            <div className="electricity-admin-card-title"><Clock3 /><div><h2>任务状态</h2><p>{data?.state.lowAlertActive ? '低电量告警已激活' : '当前无激活告警'}</p></div></div>
            <dl className="electricity-admin-dl"><div><dt>最近成功</dt><dd>{data?.state.lastSuccessAt ? String(data.state.lastSuccessAt) : '—'}</dd></div><div><dt>最近错误</dt><dd>{data?.state.lastErrorCode || '—'}</dd></div></dl>
          </section>
        </div>
      </section>

      <section className="electricity-admin-card electricity-admin-live">
        <div className="electricity-admin-card-title"><RefreshCw /><div><h2>当前数据</h2><p>{data?.current ? `状态：${data.status}` : '尚未采集快照'}</p></div></div>
        <div className="electricity-admin-values"><div><span>今日用电</span><strong>{number(data?.current?.todayUse ?? null)}</strong></div><div><span>自购剩余</span><strong>{number(data?.current?.purchasedRemaining ?? null)}</strong></div><div><span>补贴剩余</span><strong>{number(data?.current?.subsidyRemaining ?? null)}</strong></div><div><span>总余量</span><strong>{number(data?.current?.totalRemaining ?? null)}</strong></div></div>
        <div className="electricity-admin-actions">
          <button type="button" className="electricity-button electricity-button--primary" disabled={Boolean(busy)} onClick={() => run('refresh', () => api('/admin/electricity/refresh', { method: 'POST' }), '电量数据已立即刷新。')}><RefreshCw className={busy === 'refresh' ? 'electricity-spin' : ''} />立即查询</button>
          <button type="button" className="electricity-button" disabled={Boolean(busy)} onClick={() => run('email', () => api('/admin/electricity/test-email', { method: 'POST' }), '测试日报已发送。')}><MailCheck />{busy === 'email' ? '发送中…' : '发送测试日报'}</button>
        </div>
      </section>
    </div>
  );
}
