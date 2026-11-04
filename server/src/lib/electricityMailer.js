const {mailText,recipientLocale}=require('./serverMessages');
const { roomContext } = require('./electricityContext');
const { getMailConfig, sendMail, safeSiteUrl } = require('./mailer');
const { renderBrandedEmail } = require('./mailTemplate');
const { mailFields } = require('./electricityReport');
const { renderElectricityDailyEmail } = require('./electricityMailTemplate');

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
  const locale=await recipientLocale(require('../db'),recipient),t=mailText(locale);
  const siteUrl = safeSiteUrl(mailConfig.site_url);
  const label = test
    ? t("测试报告")
    : period === 'morning'
      ? t("早间简报")
      : period === 'evening'
        ? t("晚间简报")
        : t("电量简报");
  const statusText =
    {
      normal: t("正常"),
      low: t("余额偏低"),
      critical: t("余额紧急"),
      unknown: t("数据不足"),
    }[status] || status;
  report = report || {
    snapshot,
    metrics,
    reportDate: snapshot.snapshotDate,
    publishedAt: new Date().toISOString(),
    collectionStatus: statusText,
  };
  report={...report,collectionStatus:t(report.collectionStatus)};
  const text = [
    `mooncci ${locale==='en'?'Dormitory electricity':'宿舍电量'} ${label}`,
    report.collectionStatus,
    ...mailFields(report,locale).map(([label, value]) => `${label}：${value}`),
    `${siteUrl}/electricity${roomContext() ? '?roomId=' + roomContext().id : ''}`,
  ].join('\n');
  const html = renderElectricityDailyEmail({
    report, label, test, locale,
    url: `${siteUrl}/electricity${roomContext() ? '?roomId=' + roomContext().id : ''}`,
  });
  return sendMail({ channel: 'electricity',
    to: recipient,
    subject: `[mooncci] ${locale==='en'?'Dormitory electricity':'宿舍电量'} ${label} · ${snapshot.snapshotDate}`,
    text,
    html,
    config: mailConfig,
  });
}

async function sendElectricityLowAlert({ snapshot, status, notifyTo }) {
  const { mailConfig, recipient } = await recipientAndConfig(notifyTo);
  if (!recipient) return { sent: false, reason: 'no_recipient' };
  const locale=await recipientLocale(require('../db'),recipient),t=mailText(locale);
  const siteUrl = safeSiteUrl(mailConfig.site_url);
  const text = [
    t("mooncci 宿舍低电量提醒"),
    `${t("总余量")}: ${displayNumber(snapshot.totalRemaining)} kWh`,
    `${t("已购余量")}: ${displayNumber(snapshot.purchasedRemaining)} kWh`,
    t("本提醒仅在状态由正常进入低电量时发送。"),
    `${siteUrl}/electricity${roomContext() ? '?roomId=' + roomContext().id : ''}`,
  ].join('\n');
  const html = renderBrandedEmail({locale,
    eyebrow: t("电量监控 / 低电量提醒"),
    title:
      status === 'critical' ? t("宿舍电量已进入紧急状态") : t("宿舍已购电量偏低"),
    intro: t("监控检测到余额已越过你设置的阈值。相同低电量状态不会重复轰炸邮箱。"),
    details: [
      {
        label: t("总余量"),
        value: `${displayNumber(snapshot.totalRemaining)} kWh`,
      },
      {
        label: t("已购余量"),
        value: `${displayNumber(snapshot.purchasedRemaining)} kWh`,
      },
      { label: t("采集日期"), value: snapshot.snapshotDate },
    ],
    callout: {
      title: t("建议操作"),
      body: t("请及时确认宿舍余额并按学校流程购电。余额恢复正常后，监控会自动解除告警状态。"),
    },
    cta: {
      label: t("查看实时状态"),
      url: `${siteUrl}/electricity${roomContext() ? '?roomId=' + roomContext().id : ''}`,
    },
    footer: t("宿舍电量监控 · 状态变化提醒"),
  });
  return sendMail({ channel: 'electricity',
    to: recipient,
    subject: `[mooncci] ${locale==='en'?'Low electricity alert':'宿舍低电量提醒'} · ${snapshot.snapshotDate}`,
    text,
    html,
    config: mailConfig,
  });
}

module.exports = { sendElectricityDailyReport, sendElectricityLowAlert };
