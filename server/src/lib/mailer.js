const {mailText,recipientLocale}=require('./serverMessages');
const {resolveConfig}=require('./mailChannels');
const {siteOrigin, brandText}=require('./siteIdentity');
const addressparser = require('nodemailer/lib/addressparser');
const nodemailer = require('nodemailer');
const db = require('../db');
const { renderBrandedEmail, safeHttpUrl } = require('./mailTemplate');

function bool(value) {
  return String(value || '').toLowerCase() === 'true';
}

function safeParse(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function cleanMailHeader(value) {
  return String(value || '').replace(/[\r\n]/g, ' ').trim();
}

function safeSiteUrl(value) {
  const fallback = 'https://moooncci.cn';
  const url = safeHttpUrl(value, fallback);

  try {
    return new URL(url).origin;
  } catch {
    return fallback;
  }
}

function safeHttpsUrl(value) {
  const url = safeHttpUrl(value);
  if (!url) return '';

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

const defaultMail = {
  enabled: process.env.MAIL_ENABLED || 'false',
  smtp_host: process.env.SMTP_HOST || '',
  smtp_port: process.env.SMTP_PORT || '465',
  smtp_secure: process.env.SMTP_SECURE || 'true',
  smtp_user: process.env.SMTP_USER || '',
  smtp_pass: process.env.SMTP_PASS || '',
  smtp_from: process.env.SMTP_FROM || '',
  notify_to: process.env.COMMENT_NOTIFY_TO || '',
  site_url: process.env.SITE_URL || 'https://moooncci.cn',
  early_access_download_url: process.env.EARLY_ACCESS_DOWNLOAD_URL || '',
};

async function getMailConfig() {
  const [rows] = await db.query(
    'SELECT setting_value FROM site_settings WHERE setting_key = "mail" LIMIT 1'
  );

  if (!rows[0]) return { ...defaultMail, site_url:siteOrigin() };

  return {
    ...defaultMail,
    ...safeParse(rows[0].setting_value, {}),
    site_url:siteOrigin(),
  };
}

function isMailEnabled(config, channel) {
  if(channel)config=resolveConfig(config,channel);
  return Boolean(
    bool(config.enabled) &&
    config.smtp_host &&
    config.smtp_user &&
    config.smtp_pass
  );
}

function createTransporter(config) {
  return nodemailer.createTransport({
    host: config.smtp_host,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
    port: Number(config.smtp_port || 465),
    secure: bool(config.smtp_secure),
    auth: {
      user: config.smtp_user,
      pass: config.smtp_pass,
    },
  });
}

async function sendMail({ to, subject, text, html, config: providedConfig, channel = 'account', locale='zh-CN' }) {
  const config = resolveConfig(providedConfig || await getMailConfig(),channel);

  if (!isMailEnabled(config)) {
    console.log('[mail] Mail is disabled or SMTP config is incomplete.');
    return { sent: false, reason: '邮件功能未启用或 SMTP 配置不完整。' };
  }

  if (!to) {
    console.log('[mail] Missing recipient. Mail was not sent.');
    return { sent: false, reason: '邮件收件人未配置。' };
  }

  const transporter = createTransporter(config);

  await transporter.sendMail({
    from: { name: cleanMailHeader(config.sender_name || 'mooncci'), address: addressparser(cleanMailHeader(config.smtp_from || config.smtp_user))[0]?.address || config.smtp_user },
    ...(config.reply_to ? {replyTo:config.reply_to} : {}),
    to,
    subject: `[mooncci] ${brandText(cleanMailHeader(subject)).replace(/^(?:\[mooncci\]\s*)+/i, '').replace(/^mooncci\s+(?=周报)/, '') || '站点通知'}`,
    text,
    html: html || renderBrandedEmail({ locale, title: subject || '站点通知', paragraphs: [text || ''] }),
  });

  console.log('[mail] Mail sent successfully.');
  return { sent: true };
}

async function sendCommentNotification(comment) {
  const config = await getMailConfig();

  if (!config.notify_to) {
    console.log('[mail] Comment notification recipient is missing.');
    return { sent: false, reason: '评论通知收件人未配置。' };
  }

  const locale=await recipientLocale(db,config.notify_to),t=mailText(locale);
  const siteUrl = safeSiteUrl(config.site_url);
  const adminUrl = `${siteUrl}/admin-login?redirect=${encodeURIComponent('/admin/comments?status=pending')}`;
  const postTitle = cleanMailHeader(comment.postTitle || 'Post comment');
  const text = [
    'Your site received a new comment waiting for review.',
    '',
    `Post: ${comment.postTitle || '-'}`,
    `User: ${comment.authorName || '-'}`,
    `Email: ${comment.authorEmail || '-'}`,
    `IP: ${comment.ip || '-'}`,
    '',
    'Comment:',
    comment.content || '',
    '',
    `Review: ${adminUrl}`,
  ].join('\n');

  const html = renderBrandedEmail({
    locale,
    eyebrow: 'mooncci / COMMENT REVIEW',
    title: t("有一条新评论等待审核"),
    intro: t("网站刚刚收到一条新评论。登录后台查看完整上下文后，再决定是否公开。"),
    details: [
      { label: t("文章"), value: comment.postTitle || '-' },
      { label: t("用户"), value: comment.authorName || '-' },
      { label: t("邮箱"), value: comment.authorEmail || '-' },
      { label: 'IP', value: comment.ip || '-' },
    ],
    callout: { title: t("评论内容"), body: comment.content || '-' },
    cta: { label: t("登录并审核"), url: adminUrl },
  });

  return sendMail({
    channel: 'notifications',
    to: config.notify_to,
    subject: `[mooncci] ${locale==='en'?'New comment awaiting review':'新评论待审核'}: ${postTitle}`,
    text,
    html,
    config,
  });
}

async function sendCommentReviewNotification(comment, status) {
  const config = await getMailConfig();

  if (!comment.authorEmail) {
    console.log('[mail] Comment author has no email. Review notification was not sent.');
    return { sent: false, reason: '评论作者没有邮箱。' };
  }

  const locale=await recipientLocale(db,comment.authorEmail),t=mailText(locale);
  const siteUrl = safeSiteUrl(config.site_url);
  const articleUrl = `${siteUrl}/${comment.updateId ? 'updates' : 'article'}/${encodeURIComponent(comment.updateId || comment.postId)}`;
  const passed = status === 'visible';
  const resultText = passed ? 'approved and visible' : 'rejected and not visible';
  const subject = passed
    ? t("[mooncci] 评论审核通过")
    : t("[mooncci] 评论未通过审核");
  const text = [
    `Your comment was ${resultText}.`,
    '',
    `Post: ${comment.postTitle || '-'}`,
    'Comment:',
    comment.content || '',
    '',
    `Article: ${articleUrl}`,
  ].join('\n');
  const html = renderBrandedEmail({
    locale,
    eyebrow: 'mooncci / COMMENT STATUS',
    title: passed ? t("你的评论已通过审核") : t("你的评论未通过审核"),
    intro: passed
      ? t("评论现在已经显示在文章页面中。感谢你参与讨论。")
      : t("这条评论本次没有公开，感谢你的理解。"),
    details: [
      { label: t("文章"), value: comment.postTitle || '-' },
      { label: t("结果"), value: resultText },
    ],
    callout: { title: t("评论内容"), body: comment.content || '-' },
    cta: { label: t("查看文章"), url: articleUrl },
  });

  return sendMail({
    channel: 'notifications',
    to: comment.authorEmail,
    subject,
    text,
    html,
    config,
  });
}

async function sendEarlyAccessOwnerNotification(application) {
  const config = await getMailConfig();

  if (!config.notify_to) {
    return { sent: false, reason: '接收提醒邮箱未配置。' };
  }

  const locale=await recipientLocale(db,config.notify_to),t=mailText(locale);
  const siteUrl = safeSiteUrl(config.site_url);
  const reviewPath = `/admin/early-access/${application.id}`;
  const reviewUrl = `${siteUrl}/admin-login?redirect=${encodeURIComponent(reviewPath)}`;
  const features = Array.isArray(application.desiredFeatures)
    ? application.desiredFeatures.join(', ')
    : String(application.desiredFeatures || '-');
  const text = [
    'PromptDock received a new Early Access application.',
    '',
    `Name: ${application.name}`,
    `Email: ${application.email}`,
    `Occupation: ${application.occupation}`,
    `Device: ${application.device}`,
    `macOS: ${application.macOSVersion}`,
    `Desired features: ${features}`,
    '',
    `Review: ${reviewUrl}`,
  ].join('\n');
  const html = renderBrandedEmail({
    locale,
    eyebrow: 'PROMPTDOCK / EARLY ACCESS',
    title: t("收到一份新的 Early Access 申请"),
    intro: t("申请已经安全保存。请登录后台查看使用场景和申请理由，再决定是否批准。"),
    details: [
      { label: t("姓名"), value: application.name },
      { label: t("邮箱"), value: application.email },
      { label: t("职业身份"), value: application.occupation },
      { label: t("设备"), value: application.device },
      { label: 'macOS', value: application.macOSVersion },
      { label: t("希望体验"), value: features },
    ],
    cta: { label: t("审核申请"), url: reviewUrl },
    footer: t("PromptDock Early Access · 申请审核通知"),
  });

  return sendMail({
    channel: 'promptdock',
    to: config.notify_to,
    subject: `[mooncci] PromptDock Early Access ${locale==='en'?'application':'申请'} #${application.id}`,
    text,
    html,
    config,
  });
}

async function sendEarlyAccessApprovalEmail(application) {
  const locale=await recipientLocale(db,application.email,application.locale||'zh-CN'),t=mailText(locale);
  const config = await getMailConfig();
  const downloadUrl = safeHttpsUrl(config.early_access_download_url);

  if (!downloadUrl) {
    return { sent: false, reason: 'Early Access HTTPS 下载地址未配置。' };
  }

  const text = [
    `Hi ${application.name},`,
    '',
    'Your PromptDock Early Access application has been approved.',
    'PromptDock currently supports macOS only.',
    '',
    `Download PromptDock: ${downloadUrl}`,
    '',
    'Thank you for helping us build a better AI prompt and workflow tool.',
  ].join('\n');
  const html = renderBrandedEmail({
    locale,
    eyebrow: 'PROMPTDOCK / WELCOME',
    title: t("你已加入 PromptDock Early Access"),
    intro: locale==='en'?`${application.name}, your application was approved. Welcome to PromptDock Early Access.`:`${application.name}，你的申请已经通过。欢迎成为 PromptDock 的首批体验用户。`,
    paragraphs: [
      t("当前 Early Access 版本仅支持 macOS。你可以通过下方按钮下载安装，并在真实工作流中体验 Prompt 管理、菜单栏工具和桌面能力。"),
      t("你的使用反馈会直接帮助我们决定后续产品方向。"),
    ],
    callout: {
      title: t("当前支持平台"),
      body: t("macOS ✓\nWindows、iPhone 与 iPad：Coming Soon"),
    },
    cta: { label: t("下载 PromptDock"), url: downloadUrl },
    footer: t("PromptDock Early Access · macOS 体验计划"),
  });

  return sendMail({
    channel: 'promptdock',
    to: application.email,
    subject: t("[mooncci] PromptDock Early Access 申请已通过"),
    text,
    html,
    config,
  });
}

function accountPermissionChanges(before, after, locale='zh-CN') {
  const t=mailText(locale);
  const roles = { owner: t("站长"), admin: t("管理员"), editor: t("编辑"), user: t("普通用户") };
  const changes = [];
  if (before.role !== after.role) changes.push({ label: t("账号角色"), value: `${roles[before.role] || before.role} → ${roles[after.role] || after.role}` });
  if (before.status !== after.status) changes.push({ label: t("账号状态"), value: `${before.status === 'active' ? t("启用") : t("停用")} → ${after.status === 'active' ? t("启用") : t("停用")}` });
  if (Number(before.can_comment) !== Number(after.can_comment)) changes.push({ label: t("普通用户评论开关"), value: `${Number(before.can_comment) === 1 ? t("允许") : t("禁止")} → ${Number(after.can_comment) === 1 ? t("允许") : t("禁止")}` });
  return changes;
}
async function sendUserPermissionsNotification(before, after) {
  const locale=await recipientLocale(db,after.email),t=mailText(locale);
  const details = accountPermissionChanges(before, after,locale);
  if (!details.length) return { sent: false, reason: '账号权限未变化。' };
  if (!after.email) return { sent: false, reason: '用户没有邮箱。' };
  const config = await getMailConfig();
  const siteUrl = safeSiteUrl(config.site_url);
  const enabled = after.status === 'active';
  const url = enabled ? `${siteUrl}/login` : siteUrl;
  const paragraphs = [enabled ? t("新的权限已经生效，你可以登录 mooncci 查看。") : t("当前账号已停用，暂时无法登录。")];
  if (Number(before.can_comment) !== Number(after.can_comment)) paragraphs.push(t("评论开关适用于普通用户；站长、管理员和编辑的评论权限按账号角色执行。"));
  paragraphs.push(t("如对这次调整有疑问，请联系站点管理员。"));
  const title = t("你的账号权限已更新");
  const intro = locale==='en'?`Hello, ${after.username || 'member'}. The site administrator updated your mooncci account permissions.`:`你好，${after.username || t("用户")}。站点管理人员更新了你的 mooncci 账号权限。`;
  return sendMail({
    channel: 'account', to: after.email, subject: t("[mooncci] 账号权限已更新"), config,
    text: [title, intro, ...details.map(item => `${item.label}：${item.value}`), ...paragraphs, '', `${locale==='en'?'Visit':'查看'} mooncci: ${url}`].join('\n'),
    html: renderBrandedEmail({ locale, eyebrow: t("账号通知"), title, intro, details, paragraphs,
      cta: { label: enabled ? t("登录 mooncci") : t("访问 mooncci"), url } }),
  });
}

module.exports = {
  defaultMail,
  getMailConfig,
  isMailEnabled,
  safeHttpsUrl,
  safeSiteUrl,
  sendMail,
  sendCommentNotification,
  sendCommentReviewNotification,
  sendUserPermissionsNotification,
  accountPermissionChanges,
  sendEarlyAccessOwnerNotification,
  sendEarlyAccessApprovalEmail,
};
