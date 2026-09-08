const { roomContext } = require('./electricityContext');
const { getMailConfig, sendMail, safeSiteUrl } = require('./mailer');
const { renderBrandedEmail } = require('./mailTemplate');
const { reportFields } = require('./electricityReport');

function displayNumber(value, digits = 2) {
  return value !== null &&
    value !== undefined &&
    value !== '' &&
    Number.isFinite(Number(value))
    ? Number(value).toFixed(digits)
    : '—';
}

async function recipientAndConfig(notifyTo) {
  const mailConfig = await getMailConfig();
  return {
    mailConfig,
    recipient: String(
      notifyTo ||
        (!roomContext() || roomContext().legacy ? mailConfig.notify_to : '') ||
        '',
    ).trim(),
  };
}

async function sendElectricityDailyReport({
  snapshot,
  metrics,
  status,
  notifyTo,
  period,
  test = false,
  report = null,
}) {
  const { mailConfig, recipient } = await recipientAndConfig(notifyTo);
  if (!recipient) return { sent: false, reason: 'no_recipient' };
  const siteUrl = safeSiteUrl(mailConfig.site_url);
  const label = test
    ? '测试报告'
    : period === 'morning'
      ? '早间简报'
      : period === 'evening'
        ? '晚间简报'
        : '电量简报';
  const statusText =
    {
      normal: '正常',
      low: '余额偏低',
      critical: '余额紧急',
      unknown: '数据不足',
    }[status] || status;
  report = report || {
    snapshot,
    metrics,
    reportDate: snapshot.snapshotDate,
    publishedAt: new Date().toISOString(),
    collectionStatus: statusText,
  };
  const text = [
    `mooncci 宿舍电量${label}`,
    ...reportFields(report).map(([label, value]) => `${label}：${value}`),
    `${siteUrl}/electricity${roomContext() ? '?roomId=' + roomContext().id : ''}`,
  ].join('\n');
  const html = renderBrandedEmail({
    eyebrow: `电量监控 / ${label}`,
    title: test ? '宿舍电量测试邮件' : `今日宿舍电量${label}`,
    intro: report
      ? report.collectionStatus
      : `采集日期 ${snapshot.snapshotDate}，状态为 ${statusText}。`,
    details: reportFields(report).map(([label, value]) => ({ label, value })),
    cta: {
      label: '查看电量监控',
      url: `${siteUrl}/electricity${roomContext() ? '?roomId=' + roomContext().id : ''}`,
    },
    footer: '宿舍电量监控 · 北京时间采集',
  });
  return sendMail({
    to: recipient,
    subject: `[mooncci] 宿舍电量${label} · ${snapshot.snapshotDate}`,
    text,
    html,
    config: mailConfig,
  });
}

async function sendElectricityLowAlert({ snapshot, status, notifyTo }) {
  const { mailConfig, recipient } = await recipientAndConfig(notifyTo);
  if (!recipient) return { sent: false, reason: 'no_recipient' };
  const siteUrl = safeSiteUrl(mailConfig.site_url);
  const text = [
    'mooncci 宿舍低电量提醒',
    `总余量：${displayNumber(snapshot.totalRemaining)} kWh`,
    `已购余量：${displayNumber(snapshot.purchasedRemaining)} kWh`,
    '本提醒仅在状态由正常进入低电量时发送。',
    `${siteUrl}/electricity${roomContext() ? '?roomId=' + roomContext().id : ''}`,
  ].join('\n');
  const html = renderBrandedEmail({
    eyebrow: '电量监控 / 低电量提醒',
    title:
      status === 'critical' ? '宿舍电量已进入紧急状态' : '宿舍已购电量偏低',
    intro: '监控检测到余额已越过你设置的阈值。相同低电量状态不会重复轰炸邮箱。',
    details: [
      {
        label: '总余量',
        value: `${displayNumber(snapshot.totalRemaining)} kWh`,
      },
      {
        label: '已购余量',
        value: `${displayNumber(snapshot.purchasedRemaining)} kWh`,
      },
      { label: '采集日期', value: snapshot.snapshotDate },
    ],
    callout: {
      title: '建议操作',
      body: '请及时确认宿舍余额并按学校流程购电。余额恢复正常后，监控会自动解除告警状态。',
    },
    cta: {
      label: '查看实时状态',
      url: `${siteUrl}/electricity${roomContext() ? '?roomId=' + roomContext().id : ''}`,
    },
    footer: '宿舍电量监控 · 状态变化提醒',
  });
  return sendMail({
    to: recipient,
    subject: `[mooncci] 宿舍低电量提醒 · ${snapshot.snapshotDate}`,
    text,
    html,
    config: mailConfig,
  });
}

module.exports = { sendElectricityDailyReport, sendElectricityLowAlert };
