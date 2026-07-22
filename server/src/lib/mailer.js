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
  const fallback = 'https://mooncci.site';
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
  site_url: process.env.SITE_URL || 'https://mooncci.site',
  early_access_download_url: process.env.EARLY_ACCESS_DOWNLOAD_URL || '',
};

async function getMailConfig() {
  const [rows] = await db.query(
    'SELECT setting_value FROM site_settings WHERE setting_key = "mail" LIMIT 1'
  );

  if (!rows[0]) return { ...defaultMail };

  return {
    ...defaultMail,
    ...safeParse(rows[0].setting_value, {}),
  };
}

function isMailEnabled(config) {
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
    port: Number(config.smtp_port || 465),
    secure: bool(config.smtp_secure),
    auth: {
      user: config.smtp_user,
      pass: config.smtp_pass,
    },
  });
}

async function sendMail({ to, subject, text, html, config: providedConfig }) {
  const config = providedConfig || await getMailConfig();

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
    from: config.smtp_from || config.smtp_user,
    to,
    subject: cleanMailHeader(subject),
    text,
    html,
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
    eyebrow: 'MOONCCI / COMMENT REVIEW',
    title: '有一条新评论等待审核',
    intro: '网站刚刚收到一条新评论。登录后台查看完整上下文后，再决定是否公开。',
    details: [
      { label: '文章', value: comment.postTitle || '-' },
      { label: '用户', value: comment.authorName || '-' },
      { label: '邮箱', value: comment.authorEmail || '-' },
      { label: 'IP', value: comment.ip || '-' },
    ],
    callout: { title: '评论内容', body: comment.content || '-' },
    cta: { label: '登录并审核', url: adminUrl },
  });

  return sendMail({
    to: config.notify_to,
    subject: `[Mooncci] New comment pending review: ${postTitle}`,
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

  const siteUrl = safeSiteUrl(config.site_url);
  const articleUrl = `${siteUrl}/article/${encodeURIComponent(comment.postId)}`;
  const passed = status === 'visible';
  const resultText = passed ? 'approved and visible' : 'rejected and not visible';
  const subject = passed
    ? '[Mooncci] Your comment was approved'
    : '[Mooncci] Your comment was rejected';
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
    eyebrow: 'MOONCCI / COMMENT STATUS',
    title: passed ? '你的评论已通过审核' : '你的评论未通过审核',
    intro: passed
      ? '评论现在已经显示在文章页面中。感谢你参与讨论。'
      : '这条评论本次没有公开，感谢你的理解。',
    details: [
      { label: '文章', value: comment.postTitle || '-' },
      { label: '结果', value: resultText },
    ],
    callout: { title: '评论内容', body: comment.content || '-' },
    cta: { label: '查看文章', url: articleUrl },
  });

  return sendMail({
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
    eyebrow: 'PROMPTDOCK / EARLY ACCESS',
    title: '收到一份新的 Early Access 申请',
    intro: '申请已经安全保存。请登录后台查看使用场景和申请理由，再决定是否批准。',
    details: [
      { label: '姓名', value: application.name },
      { label: '邮箱', value: application.email },
      { label: '职业身份', value: application.occupation },
      { label: '设备', value: application.device },
      { label: 'macOS', value: application.macOSVersion },
      { label: '希望体验', value: features },
    ],
    cta: { label: '审核申请', url: reviewUrl },
    footer: 'PromptDock Early Access · Secure owner review',
  });

  return sendMail({
    to: config.notify_to,
    subject: `[PromptDock] Early Access 申请 #${application.id}`,
    text,
    html,
    config,
  });
}

async function sendEarlyAccessApprovalEmail(application) {
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
    eyebrow: 'PROMPTDOCK / WELCOME',
    title: '你已加入 PromptDock Early Access',
    intro: `${application.name}，你的申请已经通过。欢迎成为 PromptDock 的首批体验用户。`,
    paragraphs: [
      '当前 Early Access 版本仅支持 macOS。你可以通过下方按钮下载安装，并在真实工作流中体验 Prompt 管理、菜单栏工具和桌面能力。',
      '你的使用反馈会直接帮助我们决定后续产品方向。',
    ],
    callout: {
      title: '当前支持平台',
      body: 'macOS ✓\nWindows、iPhone 与 iPad：Coming Soon',
    },
    cta: { label: '下载 PromptDock', url: downloadUrl },
    footer: 'PromptDock Early Access · Local-first AI productivity for macOS',
  });

  return sendMail({
    to: application.email,
    subject: '[PromptDock] 你的 Early Access 申请已通过',
    text,
    html,
    config,
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
  sendEarlyAccessOwnerNotification,
  sendEarlyAccessApprovalEmail,
};
