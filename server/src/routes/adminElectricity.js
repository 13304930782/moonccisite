const express = require('express');
const { authRequired, ownerOnly } = require('../middleware/auth');
const repository = require('../repositories/electricityRepository');
const { getDashboardData, refreshElectricity, sendTestElectricityEmail } = require('../services/electricityMonitor');
const { reloadElectricitySchedule } = require('../jobs/electricityScheduler');
const { DEFAULT_MANUAL_COOLDOWN_MINUTES, manualRefreshGuard } = require('../lib/electricitySchedule');

const router = express.Router();
router.use(authRequired, ownerOnly);

function isEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
}

function safeError(error, fallback) {
  const allowed = new Set([
    'ELECTRICITY_NOT_CONFIGURED', 'ELECTRICITY_NO_SNAPSHOT', 'ELECTRICITY_TIMEOUT',
    'ELECTRICITY_NETWORK_ERROR', 'ELECTRICITY_HTTP_ERROR', 'ELECTRICITY_ACCESS_RESTRICTED',
    'ELECTRICITY_RATE_LIMITED',
  ]);
  return allowed.has(error?.code) ? error.message : fallback;
}

router.get('/settings', async (_req, res) => {
  try {
    const [config, state, dashboard] = await Promise.all([
      repository.getElectricityConfig(),
      repository.getMonitorState(),
      getDashboardData(7),
    ]);
    res.json({
      data: {
        config,
        credentials: {
          accountConfigured: Boolean(String(process.env.ELECTRICITY_SCHOOL_ACCOUNT || '').trim()),
          roomVerifyConfigured: Boolean(String(process.env.ELECTRICITY_ROOM_VERIFY || '').trim()),
        },
        state,
        current: dashboard.current,
        status: dashboard.status,
      },
    });
  } catch {
    res.status(500).json({ message: '读取电量监控设置失败。' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    if (!isEmail(req.body?.notifyTo)) return res.status(400).json({ message: '通知邮箱格式不正确。' });
    const config = await repository.saveElectricityConfig(req.body || {});
    reloadElectricitySchedule().catch((error) => console.error('[electricity] schedule reload failed:', error?.code || 'SCHEDULE_RELOAD_FAILED'));
    res.json({ data: config, message: '电量监控设置已保存。' });
  } catch {
    res.status(500).json({ message: '保存电量监控设置失败。' });
  }
});

router.post('/refresh', async (_req, res) => {
  try {
    const state = await repository.getMonitorState();
    const cooldownMinutes = Number(process.env.ELECTRICITY_MANUAL_COOLDOWN_MINUTES) || DEFAULT_MANUAL_COOLDOWN_MINUTES;
    const guard = manualRefreshGuard(state, new Date(), cooldownMinutes);
    if (guard.blocked) {
      if (guard.retryAfterSeconds) res.set('Retry-After', String(guard.retryAfterSeconds));
      const message = guard.reason === 'paused_after_failure'
        ? '今天的电量采集已因失败暂停，请明天再试。'
        : `查询过于频繁，请在 ${guard.retryAfterSeconds} 秒后再试。`;
      return res.status(429).json({ message, retryAfterSeconds: guard.retryAfterSeconds });
    }
    res.json({ data: await refreshElectricity(), message: '电量数据已刷新。' });
  } catch (error) {
    res.status(error?.code === 'ELECTRICITY_NOT_CONFIGURED' ? 400 : 502).json({ message: safeError(error, '刷新电量数据失败。') });
  }
});

router.post('/test-email', async (_req, res) => {
  try {
    const result = await sendTestElectricityEmail();
    if (!result.daily?.sent) return res.status(400).json({ message: result.daily?.reason || '测试邮件未发送。' });
    res.json({ message: '测试邮件已发送。' });
  } catch (error) {
    res.status(error?.code === 'ELECTRICITY_NO_SNAPSHOT' ? 400 : 500).json({ message: safeError(error, '测试邮件发送失败。') });
  }
});

module.exports = router;
