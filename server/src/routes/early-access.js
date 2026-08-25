const express = require('express');
const db = require('../db');
const { authRequired, ownerOnly } = require('../middleware/auth');
const {
  getMailConfig,
  isMailEnabled,
  safeHttpsUrl,
  sendEarlyAccessApprovalEmail,
  sendEarlyAccessOwnerNotification,
} = require('../lib/mailer');

const publicRouter = express.Router();
const adminRouter = express.Router();

const OCCUPATIONS = new Set(['student', 'teacher', 'developer', 'creator', 'enterprise', 'other']);
const DEVICES = new Set(['macbook', 'imac', 'mac_mini', 'mac_studio']);
const FEATURES = new Set(['prompt_management', 'ai_workflow', 'desktop_widget', 'menu_bar', 'ai_assistant']);
const SUCCESS_MESSAGE = '感谢加入 Early Access 计划！我们会通过邮件联系你。';

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function text(value) {
  return String(value ?? '').trim();
}

function normalizedEmail(value) {
  return text(value).toLowerCase();
}

function isEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseFeatures(value) {
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function publicApplication(row) {
  if (!row) return null;

  return {
    ...row,
    desired_features: parseFeatures(row.desired_features),
  };
}

function mailApplication(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    occupation: row.occupation,
    useCase: row.use_case,
    device: row.device,
    macOSVersion: row.macos_version,
    desiredFeatures: parseFeatures(row.desired_features),
    reason: row.reason,
  };
}

function safeErrorMessage(error) {
  return text(error?.message || '邮件发送失败。').slice(0, 500);
}

function validateApplication(body) {
  const application = {
    name: text(body.name),
    email: text(body.email),
    emailNormalized: normalizedEmail(body.email),
    occupation: text(body.occupation),
    useCase: text(body.useCase),
    device: text(body.device),
    macOSVersion: text(body.macOSVersion),
    desiredFeatures: Array.isArray(body.desiredFeatures)
      ? [...new Set(body.desiredFeatures.map(text).filter(Boolean))]
      : [],
    reason: text(body.reason),
  };

  if (!application.name || application.name.length > 80) return { error: '请填写不超过 80 个字符的姓名。' };
  if (!isEmail(application.emailNormalized)) return { error: '请填写有效的邮箱地址。' };
  if (!OCCUPATIONS.has(application.occupation)) return { error: '请选择有效的职业身份。' };
  if (!application.useCase || application.useCase.length > 3000) return { error: '请填写不超过 3000 个字符的主要使用场景。' };
  if (!DEVICES.has(application.device)) return { error: '请选择有效的 Mac 设备。' };
  if (!application.macOSVersion || application.macOSVersion.length > 100) return { error: '请填写不超过 100 个字符的 macOS 版本。' };
  if (!application.desiredFeatures.length || application.desiredFeatures.some((item) => !FEATURES.has(item))) {
    return { error: '请至少选择一项希望体验的功能。' };
  }
  if (!application.reason || application.reason.length > 3000) return { error: '请填写不超过 3000 个字符的申请理由。' };

  return { application };
}

async function getApplication(id) {
  const [rows] = await db.query(
    `
    SELECT ea.*, reviewer.username AS reviewer_name
    FROM early_access_applications ea
    LEFT JOIN users reviewer ON reviewer.id = ea.reviewer_id
    WHERE ea.id=?
    LIMIT 1
    `,
    [id]
  );

  return rows[0] || null;
}

async function recordOwnerNotification(id, result) {
  if (result.sent) {
    await db.query(
      'UPDATE early_access_applications SET owner_notification_sent_at=NOW(), owner_notification_error=NULL WHERE id=?',
      [id]
    );
    return;
  }

  await db.query(
    'UPDATE early_access_applications SET owner_notification_error=? WHERE id=?',
    [text(result.reason || '邮件未发送。').slice(0, 500), id]
  );
}

async function recordApprovalNotification(id, result) {
  if (result.sent) {
    await db.query(
      'UPDATE early_access_applications SET approval_email_sent_at=NOW(), approval_email_error=NULL WHERE id=?',
      [id]
    );
    return;
  }

  await db.query(
    'UPDATE early_access_applications SET approval_email_error=? WHERE id=?',
    [text(result.reason || '邮件未发送。').slice(0, 500), id]
  );
}

publicRouter.post('/', asyncHandler(async (req, res) => {
  const validation = validateApplication(req.body || {});
  if (validation.error) return res.status(400).json({ message: validation.error });

  const application = validation.application;

  try {
    const [result] = await db.query(
      `
      INSERT INTO early_access_applications
      (name, email, email_normalized, occupation, use_case, device, macos_version, desired_features, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        application.name,
        application.email,
        application.emailNormalized,
        application.occupation,
        application.useCase,
        application.device,
        application.macOSVersion,
        JSON.stringify(application.desiredFeatures),
        application.reason,
      ]
    );

    const inserted = { id: result.insertId, ...application };

    try {
      const mailResult = await sendEarlyAccessOwnerNotification(inserted);
      try {
        await recordOwnerNotification(result.insertId, mailResult);
      } catch (recordError) {
        console.error(`[early-access] could not record owner notification for application ${result.insertId}:`, recordError?.code || recordError?.message);
      }
    } catch (error) {
      try {
        await db.query(
          'UPDATE early_access_applications SET owner_notification_error=? WHERE id=?',
          [safeErrorMessage(error), result.insertId]
        );
      } catch (recordError) {
        console.error(`[early-access] could not record owner notification failure for application ${result.insertId}:`, recordError?.code || recordError?.message);
      }
      console.error(`[early-access] owner notification failed for application ${result.insertId}:`, safeErrorMessage(error));
    }

    return res.status(201).json({ message: SUCCESS_MESSAGE });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.json({ message: SUCCESS_MESSAGE });
    }

    console.error('[early-access] application insert failed:', error?.code || error?.message);
    return res.status(500).json({ message: '申请提交失败，请稍后再试。' });
  }
}));

adminRouter.use(authRequired, ownerOnly);

adminRouter.get('/', asyncHandler(async (req, res) => {
  const status = text(req.query.status || 'all');
  const keyword = text(req.query.keyword);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = 30;
  const where = [];
  const params = [];

  if (status !== 'all') {
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: '申请状态不合法。' });
    }
    where.push('ea.status=?');
    params.push(status);
  }

  if (keyword) {
    where.push('(ea.name LIKE ? OR ea.email_normalized LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword.toLowerCase()}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[countRow]] = await db.query(
    `SELECT COUNT(*) AS total FROM early_access_applications ea ${whereSql}`,
    params
  );
  const [rows] = await db.query(
    `
    SELECT ea.*, reviewer.username AS reviewer_name
    FROM early_access_applications ea
    LEFT JOIN users reviewer ON reviewer.id=ea.reviewer_id
    ${whereSql}
    ORDER BY ea.created_at DESC
    LIMIT ? OFFSET ?
    `,
    [...params, pageSize, (page - 1) * pageSize]
  );

  res.json({
    items: rows.map(publicApplication),
    page,
    pageSize,
    total: Number(countRow?.total || 0),
  });
}));

adminRouter.get('/:id', asyncHandler(async (req, res) => {
  const application = await getApplication(req.params.id);
  if (!application) return res.status(404).json({ message: '申请不存在。' });
  res.json(publicApplication(application));
}));

adminRouter.post('/:id/approve', asyncHandler(async (req, res) => {
  const application = await getApplication(req.params.id);
  if (!application) return res.status(404).json({ message: '申请不存在。' });
  if (application.status !== 'pending') return res.status(409).json({ message: '这份申请已经审核。' });

  const config = await getMailConfig();
  if (!safeHttpsUrl(config.early_access_download_url)) {
    return res.status(400).json({ message: '请先在邮件设置中配置有效的 HTTPS Early Access 下载地址。' });
  }
  if (!isMailEnabled(config)) {
    return res.status(400).json({ message: '请先启用邮件功能并完成 SMTP 配置，再批准申请。' });
  }

  const reviewNote = text(req.body?.reviewNote);
  if (reviewNote.length > 2000) return res.status(400).json({ message: '审核备注不能超过 2000 个字符。' });

  const [result] = await db.query(
    `
    UPDATE early_access_applications
    SET status='approved', reviewer_id=?, review_note=?, reviewed_at=NOW()
    WHERE id=? AND status='pending'
    `,
    [req.user.id, reviewNote, req.params.id]
  );

  if (result.affectedRows !== 1) return res.status(409).json({ message: '这份申请已经被其他操作审核。' });

  try {
    const mailResult = await sendEarlyAccessApprovalEmail(mailApplication(application));
    await recordApprovalNotification(application.id, mailResult);
    const updated = await getApplication(application.id);

    return res.json({
      message: mailResult.sent ? '申请已批准，通过邮件已发送。' : `申请已批准，但邮件未发送：${mailResult.reason}`,
      application: publicApplication(updated),
    });
  } catch (error) {
    const errorMessage = safeErrorMessage(error);
    await db.query(
      'UPDATE early_access_applications SET approval_email_error=? WHERE id=?',
      [errorMessage, application.id]
    );
    console.error(`[early-access] approval email failed for application ${application.id}:`, errorMessage);
    const updated = await getApplication(application.id);
    return res.json({ message: '申请已批准，但通过邮件发送失败，可稍后重试。', application: publicApplication(updated) });
  }
}));

adminRouter.post('/:id/reject', asyncHandler(async (req, res) => {
  const reviewNote = text(req.body?.reviewNote);
  if (reviewNote.length > 2000) return res.status(400).json({ message: '审核备注不能超过 2000 个字符。' });

  const [result] = await db.query(
    `
    UPDATE early_access_applications
    SET status='rejected', reviewer_id=?, review_note=?, reviewed_at=NOW()
    WHERE id=? AND status='pending'
    `,
    [req.user.id, reviewNote, req.params.id]
  );

  if (result.affectedRows !== 1) {
    const existing = await getApplication(req.params.id);
    return res.status(existing ? 409 : 404).json({ message: existing ? '这份申请已经审核。' : '申请不存在。' });
  }

  res.json({ message: '申请已拒绝，不会向申请人发送邮件。', application: publicApplication(await getApplication(req.params.id)) });
}));

adminRouter.post('/:id/resend-owner-notification', asyncHandler(async (req, res) => {
  const application = await getApplication(req.params.id);
  if (!application) return res.status(404).json({ message: '申请不存在。' });
  if (application.owner_notification_sent_at) return res.status(409).json({ message: 'owner 通知已经发送，无需重复发送。' });

  try {
    const result = await sendEarlyAccessOwnerNotification(mailApplication(application));
    await recordOwnerNotification(application.id, result);
    return res.json({
      message: result.sent ? 'owner 通知已重新发送。' : `通知未发送：${result.reason}`,
      application: publicApplication(await getApplication(application.id)),
    });
  } catch (error) {
    const errorMessage = safeErrorMessage(error);
    await db.query('UPDATE early_access_applications SET owner_notification_error=? WHERE id=?', [errorMessage, application.id]);
    return res.status(502).json({ message: 'owner 通知发送失败，请检查 SMTP 设置。' });
  }
}));

adminRouter.post('/:id/resend-approval-email', asyncHandler(async (req, res) => {
  const application = await getApplication(req.params.id);
  if (!application) return res.status(404).json({ message: '申请不存在。' });
  if (application.status !== 'approved') return res.status(400).json({ message: '只有已批准申请可以发送通过邮件。' });
  if (application.approval_email_sent_at) return res.status(409).json({ message: '通过邮件已经发送，无需重复发送。' });

  const config = await getMailConfig();
  if (!safeHttpsUrl(config.early_access_download_url)) {
    return res.status(400).json({ message: '请先配置有效的 HTTPS Early Access 下载地址。' });
  }
  if (!isMailEnabled(config)) {
    return res.status(400).json({ message: '请先启用邮件功能并完成 SMTP 配置。' });
  }

  try {
    const result = await sendEarlyAccessApprovalEmail(mailApplication(application));
    await recordApprovalNotification(application.id, result);
    return res.json({
      message: result.sent ? '通过邮件已重新发送。' : `邮件未发送：${result.reason}`,
      application: publicApplication(await getApplication(application.id)),
    });
  } catch (error) {
    const errorMessage = safeErrorMessage(error);
    await db.query('UPDATE early_access_applications SET approval_email_error=? WHERE id=?', [errorMessage, application.id]);
    return res.status(502).json({ message: '通过邮件发送失败，请检查 SMTP 设置。' });
  }
}));

module.exports = {
  publicRouter,
  adminRouter,
  validateApplication,
};
