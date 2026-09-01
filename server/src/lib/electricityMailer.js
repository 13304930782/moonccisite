const { getMailConfig, sendMail, safeSiteUrl } = require('./mailer');
const { renderBrandedEmail } = require('./mailTemplate');

function displayNumber(value, digits = 2) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
}

async function recipientAndConfig(notifyTo) {
  const mailConfig = await getMailConfig();
  return { mailConfig, recipient: String(notifyTo || mailConfig.notify_to || '').trim() };
}

async function sendElectricityDailyReport({ snapshot, metrics, status, notifyTo, test = false }) {
  const { mailConfig, recipient } = await recipientAndConfig(notifyTo);
  const siteUrl = safeSiteUrl(mailConfig.site_url);
  const label = test ? '测试报告' : '每日简报';
  const text = [
    `Mooncci 宿舍电量${label}`,
    `日期：${snapshot.snapshotDate}`,
    `总余量：${displayNumber(snapshot.totalRemaining)} kWh`,
    `已购余量：${displayNumber(snapshot.purchasedRemaining)} kWh`,
    `补贴余量：${displayNumber(snapshot.subsidyRemaining)} kWh`,
    `今日用电：${displayNumber(snapshot.todayUse)} kWh`,
    `当前电价：${displayNumber(snapshot.price)} 元/kWh`,
    `较前次变化：${metrics.balanceChange === null ? '数据不足' : `${metrics.balanceChange > 0 ? '+' : ''}${displayNumber(metrics.balanceChange)} kWh`}`,
    `最近 7 天平均：${metrics.averageDailyUse === null ? '数据积累中' : `${displayNumber(metrics.averageDailyUse)} kWh/天`}`,
    `预计可用：${metrics.estimatedDaysRemaining === null ? '数据积累中' : `${displayNumber(metrics.estimatedDaysRemaining, 1)} 天`}`,
    `状态：${status}`,
    `${siteUrl}/electricity`,
  ].join('\n');
  const html = renderBrandedEmail({
    eyebrow: `MOONCCI / ELECTRICITY ${test ? 'TEST' : 'DAILY'}`,
    title: test ? '宿舍电量测试邮件' : '今日宿舍电量简报',
    intro: `采集日期 ${snapshot.snapshotDate}，状态为 ${status.toUpperCase()}。`,
    details: [
      { label: '总余量', value: `${displayNumber(snapshot.totalRemaining)} kWh` },
      { label: '已购余量', value: `${displayNumber(snapshot.purchasedRemaining)} kWh` },
      { label: '补贴余量', value: `${displayNumber(snapshot.subsidyRemaining)} kWh` },
      { label: '今日用电', value: `${displayNumber(snapshot.todayUse)} kWh` },
      { label: '当前电价', value: `${displayNumber(snapshot.price)} 元/kWh` },
      { label: '较前次变化', value: metrics.balanceChange === null ? '数据不足' : `${metrics.balanceChange > 0 ? '+' : ''}${displayNumber(metrics.balanceChange)} kWh` },
      { label: '7 日平均', value: metrics.averageDailyUse === null ? '数据积累中' : `${displayNumber(metrics.averageDailyUse)} kWh/天` },
      { label: '预计可用', value: metrics.estimatedDaysRemaining === null ? '数据积累中' : `${displayNumber(metrics.estimatedDaysRemaining, 1)} 天` },
    ],
    cta: { label: '查看电量 Dashboard', url: `${siteUrl}/electricity` },
    footer: 'Mooncci Electricity Monitor · Asia/Shanghai daily snapshot',
  });
  return sendMail({ to: recipient, subject: `[Mooncci] 宿舍电量${label} · ${snapshot.snapshotDate}`, text, html, config: mailConfig });
}

async function sendElectricityLowAlert({ snapshot, status, notifyTo }) {
  const { mailConfig, recipient } = await recipientAndConfig(notifyTo);
  const siteUrl = safeSiteUrl(mailConfig.site_url);
  const text = [
    'Mooncci 宿舍低电量提醒',
    `总余量：${displayNumber(snapshot.totalRemaining)} kWh`,
    `已购余量：${displayNumber(snapshot.purchasedRemaining)} kWh`,
    '本提醒仅在状态由正常进入低电量时发送。',
    `${siteUrl}/electricity`,
  ].join('\n');
  const html = renderBrandedEmail({
    eyebrow: 'MOONCCI / LOW ELECTRICITY ALERT',
    title: status === 'critical' ? '宿舍电量已进入紧急状态' : '宿舍已购电量偏低',
    intro: '监控检测到余额已越过你设置的阈值。相同低电量状态不会重复轰炸邮箱。',
    details: [
      { label: '总余量', value: `${displayNumber(snapshot.totalRemaining)} kWh` },
      { label: '已购余量', value: `${displayNumber(snapshot.purchasedRemaining)} kWh` },
      { label: '采集日期', value: snapshot.snapshotDate },
    ],
    callout: { title: '建议操作', body: '请及时确认宿舍余额并按学校流程购电。余额恢复正常后，监控会自动解除告警状态。' },
    cta: { label: '查看实时状态', url: `${siteUrl}/electricity` },
    footer: 'Mooncci Electricity Monitor · Transition-based alerting',
  });
  return sendMail({ to: recipient, subject: `[Mooncci] 宿舍低电量提醒 · ${snapshot.snapshotDate}`, text, html, config: mailConfig });
}

module.exports = { sendElectricityDailyReport, sendElectricityLowAlert };
