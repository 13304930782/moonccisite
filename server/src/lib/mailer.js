const nodemailer = require('nodemailer');
const db = require('../db');

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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function htmlLines(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function cleanMailHeader(value) {
  return String(value || '').replace(/[\r\n]/g, ' ').trim();
}

function safeSiteUrl(value) {
  const fallback = 'https://mooncci.site';
  const input = String(value || fallback).trim();

  try {
    const parsed = new URL(input);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : fallback;
  } catch {
    return fallback;
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
};

async function getMailConfig() {
  const [rows] = await db.query(
    'SELECT setting_value FROM site_settings WHERE setting_key = "mail" LIMIT 1'
  );

  if (!rows[0]) return defaultMail;

  return {
    ...defaultMail,
    ...safeParse(rows[0].setting_value, {}),
  };
}

function isMailEnabled(config) {
  return (
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

async function sendMail({ to, subject, text, html }) {
  const config = await getMailConfig();

  if (!isMailEnabled(config)) {
    console.log('[mail] Mail is disabled or SMTP config is incomplete.');
    return;
  }

  if (!to) {
    console.log('[mail] Missing recipient. Mail was not sent.');
    return;
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
}

async function sendCommentNotification(comment) {
  const config = await getMailConfig();

  if (!isMailEnabled(config) || !config.notify_to) {
    console.log('[mail] Comment notification is disabled or notify_to is missing.');
    return;
  }

  const siteUrl = safeSiteUrl(config.site_url);
  const adminUrl = `${siteUrl}/admin-login?redirect=${encodeURIComponent('/admin/comments?status=pending')}`;
  const postTitle = cleanMailHeader(comment.postTitle || 'Post comment');

  const text = `
Your site received a new comment waiting for review.

Post: ${comment.postTitle || '-'}
User: ${comment.authorName || '-'}
Email: ${comment.authorEmail || '-'}
IP: ${comment.ip || '-'}

Comment:
${comment.content || ''}

Review:
${adminUrl}
`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.8; color: #111827;">
      <h2>Your site received a new comment</h2>
      <p>Status: <strong style="color:#2563eb;">Pending review</strong></p>
      <p><strong>Post:</strong> ${escapeHtml(comment.postTitle || '-')}</p>
      <p><strong>User:</strong> ${escapeHtml(comment.authorName || '-')}</p>
      <p><strong>Email:</strong> ${escapeHtml(comment.authorEmail || '-')}</p>
      <p><strong>IP:</strong> ${escapeHtml(comment.ip || '-')}</p>
      <div style="margin-top: 16px; padding: 16px; background: #f3f4f6; border-radius: 12px;">
        <strong>Comment:</strong>
        <p>${htmlLines(comment.content || '')}</p>
      </div>
      <p style="margin-top: 24px;">
        <a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#2563eb;color:white;padding:10px 18px;border-radius:999px;text-decoration:none;">
          Log in and review
        </a>
      </p>
    </div>
  `;

  await sendMail({
    to: config.notify_to,
    subject: `[Mooncci] New comment pending review: ${postTitle}`,
    text,
    html,
  });
}

async function sendCommentReviewNotification(comment, status) {
  const config = await getMailConfig();

  if (!isMailEnabled(config)) {
    console.log('[mail] Comment review notification is disabled.');
    return;
  }

  if (!comment.authorEmail) {
    console.log('[mail] Comment author has no email. Review notification was not sent.');
    return;
  }

  const siteUrl = safeSiteUrl(config.site_url);
  const articleUrl = `${siteUrl}/article/${encodeURIComponent(comment.postId)}`;
  const passed = status === 'visible';
  const resultText = passed
    ? 'approved and visible'
    : 'rejected and not visible';
  const subject = passed
    ? '[Mooncci] Your comment was approved'
    : '[Mooncci] Your comment was rejected';

  const text = `
Your comment was ${resultText}.

Post: ${comment.postTitle || '-'}
Comment:
${comment.content || ''}

Article:
${articleUrl}
`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.8; color: #111827;">
      <h2>${passed ? 'Your comment was approved' : 'Your comment was rejected'}</h2>
      <p>Post: <strong>${escapeHtml(comment.postTitle || '-')}</strong></p>
      <p>Result: <strong style="color:${passed ? '#16a34a' : '#dc2626'};">${escapeHtml(resultText)}</strong></p>
      <div style="margin-top: 16px; padding: 16px; background: #f3f4f6; border-radius: 12px;">
        <strong>Comment:</strong>
        <p>${htmlLines(comment.content || '')}</p>
      </div>
      <p style="margin-top: 24px;">
        <a href="${escapeHtml(articleUrl)}" style="display:inline-block;background:#2563eb;color:white;padding:10px 18px;border-radius:999px;text-decoration:none;">
          View article
        </a>
      </p>
    </div>
  `;

  await sendMail({
    to: comment.authorEmail,
    subject,
    text,
    html,
  });
}

module.exports = {
  getMailConfig,
  sendMail,
  sendCommentNotification,
  sendCommentReviewNotification,
};
