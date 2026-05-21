const express = require('express');
const db = require('../db');
const { authRequired, adminOnly } = require('../middleware/auth');
const { getMailConfig, sendMail } = require('../lib/mailer');

const router = express.Router();
const CUSTOM_MAIL_DAILY_LIMIT = Number(process.env.CUSTOM_MAIL_DAILY_LIMIT || 20);

const defaultBrand = {
  site_title: 'Mooncci Blog',
  nav_title: 'Mooncci Blog',
  logo_url: '',
  favicon_url: '',
};

const defaultProfile = {
  name: 'mooncci',
  title: 'Blog owner',
  bio: 'Notes about technology, life and thinking.',
  avatar_url: '',
  github_url: '',
  twitter_url: '',
  email: '',
};

const defaultHero = {
  badge: 'Welcome',
  title_before: 'Explore ',
  title_highlight: 'programming',
  title_after: ' and ideas',
  subtitle: 'Articles about frontend, backend, algorithms and systems.',
  primary_text: 'Read articles',
  primary_link: '/articles',
  secondary_text: 'Browse categories',
  secondary_link: '/categories',
};

const defaultFooter = {
  copyright: 'Copyright Mooncci',
  icp_text: '',
  icp_url: 'https://beian.miit.gov.cn/',
  police_text: '',
  police_url: 'https://beian.mps.gov.cn/',
  police_icon_url: '',
};

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
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

function cleanMailHeader(value) {
  return String(value || '').replace(/[\r\n]/g, ' ').trim();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function getCustomMailCountToday(senderId) {
  const [rows] = await db.query(
    `
    SELECT COUNT(*) AS count
    FROM custom_mail_logs
    WHERE sender_id=?
      AND created_at >= CURRENT_DATE()
      AND created_at < DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY)
    `,
    [senderId]
  );

  return Number(rows[0]?.count || 0);
}

async function logCustomMail({ senderId, recipientUserId, recipientEmail, subject, status, errorMessage = '' }) {
  await db.query(
    `
    INSERT INTO custom_mail_logs
    (sender_id, recipient_user_id, recipient_email, subject, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      senderId,
      recipientUserId || null,
      recipientEmail,
      subject,
      status,
      errorMessage ? String(errorMessage).slice(0, 500) : null,
    ]
  );
}

function stringValue(value) {
  return value == null ? '' : String(value);
}

function pickStringFields(source, fallback) {
  const output = { ...fallback };

  for (const key of Object.keys(fallback)) {
    if (Object.prototype.hasOwnProperty.call(source || {}, key)) {
      output[key] = stringValue(source[key]);
    }
  }

  return output;
}

async function getSetting(key, fallback) {
  const [rows] = await db.query(
    'SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1',
    [key]
  );

  if (!rows[0]) return fallback;

  return {
    ...fallback,
    ...safeParse(rows[0].setting_value, {}),
  };
}

async function saveSetting(key, value) {
  await db.query(
    `
    INSERT INTO site_settings (setting_key, setting_value)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
    `,
    [key, JSON.stringify(value)]
  );
}

function publicMailConfig(config) {
  return {
    ...defaultMail,
    ...config,
    smtp_pass: '',
    has_smtp_pass: Boolean(config.smtp_pass),
  };
}

router.get('/site', async (_req, res) => {
  const brand = await getSetting('brand', defaultBrand);
  const profile = await getSetting('profile', defaultProfile);
  const hero = await getSetting('hero', defaultHero);
  const footer = await getSetting('footer', defaultFooter);

  res.json({ brand, profile, hero, footer });
});

router.put('/site', authRequired, adminOnly, async (req, res) => {
  const body = req.body || {};
  const currentBrand = await getSetting('brand', defaultBrand);
  const currentProfile = await getSetting('profile', defaultProfile);
  const currentHero = await getSetting('hero', defaultHero);
  const currentFooter = await getSetting('footer', defaultFooter);

  const brand = pickStringFields(body.brand, currentBrand);
  const profile = pickStringFields(body.profile, currentProfile);
  const hero = pickStringFields(body.hero, currentHero);
  const footer = pickStringFields(body.footer, currentFooter);

  await saveSetting('brand', brand);
  await saveSetting('profile', profile);
  await saveSetting('hero', hero);
  await saveSetting('footer', footer);

  res.json({
    message: 'Site settings saved.',
    brand,
    profile,
    hero,
    footer,
  });
});

router.get('/mail', authRequired, adminOnly, async (_req, res) => {
  const config = await getMailConfig();
  res.json(publicMailConfig(config));
});

router.put('/mail', authRequired, adminOnly, async (req, res) => {
  const oldConfig = await getMailConfig();
  const body = req.body || {};
  const inputConfig = pickStringFields(body, oldConfig);

  const nextConfig = {
    ...defaultMail,
    ...oldConfig,
    ...inputConfig,
  };

  if (!Object.prototype.hasOwnProperty.call(body, 'smtp_pass') || !body.smtp_pass) {
    nextConfig.smtp_pass = oldConfig.smtp_pass || '';
  }

  await saveSetting('mail', nextConfig);

  res.json({
    message: 'Mail settings saved.',
    mail: publicMailConfig(nextConfig),
  });
});

router.post('/mail/test', authRequired, adminOnly, async (_req, res) => {
  const config = await getMailConfig();

  if (!config.notify_to) {
    return res.status(400).json({ message: 'Please configure a notification recipient first.' });
  }

  await sendMail({
    to: config.notify_to,
    subject: '[Mooncci] Mail notification test',
    text: 'This is a test email from Mooncci Blog. If you receive it, mail notifications are configured correctly.',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.8; color: #111827;">
        <h2>Mooncci Blog mail notification test</h2>
        <p>If you receive this email, mail notifications are configured correctly.</p>
        <p>Future pending comments can send review notifications to this mailbox.</p>
      </div>
    `,
  });

  res.json({ message: 'Test email sent.' });
});

router.post('/mail/send-custom', authRequired, adminOnly, async (req, res) => {
  try {
    const to = normalizeEmail(req.body.to);
    const subject = cleanMailHeader(req.body.subject);
    const content = String(req.body.content || '').trim();

    if (!to || !isEmailLike(to)) {
      return res.status(400).json({ message: 'A valid recipient email is required.' });
    }

    if (!subject) {
      return res.status(400).json({ message: 'Email subject is required.' });
    }

    if (subject.length > 120) {
      return res.status(400).json({ message: 'Email subject is too long.' });
    }

    if (!content) {
      return res.status(400).json({ message: 'Email content is required.' });
    }

    if (content.length > 5000) {
      return res.status(400).json({ message: 'Email content is too long.' });
    }

    const [recipients] = await db.query(
      'SELECT id FROM users WHERE email=? AND status="active" LIMIT 1',
      [to]
    );

    const recipient = recipients[0];

    if (!recipient) {
      return res.status(400).json({ message: 'Custom emails can only be sent to active registered users.' });
    }

    const sentToday = await getCustomMailCountToday(req.user.id);

    if (sentToday >= CUSTOM_MAIL_DAILY_LIMIT) {
      return res.status(429).json({ message: 'Daily custom email limit reached.' });
    }

    try {
      await sendMail({
        to,
        subject,
        text: content,
        html: `<div style="font-family: Arial, sans-serif; line-height: 1.8; color: #111827;">${escapeHtml(content)}</div>`,
      });

      await logCustomMail({
        senderId: req.user.id,
        recipientUserId: recipient.id,
        recipientEmail: to,
        subject,
        status: 'sent',
      });
    } catch (mailErr) {
      await logCustomMail({
        senderId: req.user.id,
        recipientUserId: recipient.id,
        recipientEmail: to,
        subject,
        status: 'failed',
        errorMessage: mailErr.message,
      });

      throw mailErr;
    }

    res.json({ message: 'Email sent.' });
  } catch (err) {
    console.error('[settings/mail/send-custom]', err);
    res.status(500).json({ message: 'Failed to send email. Please check SMTP settings or server logs.' });
  }
});

module.exports = router;
