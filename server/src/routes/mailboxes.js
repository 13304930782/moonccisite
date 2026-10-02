const crypto = require('crypto');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { authRequired, ownerOnly } = require('../middleware/auth');
const { DOMAIN, localPart, email, header, seal, open } = require('../lib/mailboxSecurity');

const router = require('../lib/asyncRouter')();
const agentRouter = require('../lib/asyncRouter')();

function verifyAgent(req, res, next) {
  const key = process.env.MAILBOX_PROVISION_KEY || '';
  const timestamp = String(req.get('X-Mooncci-Timestamp') || '');
  const signature = String(req.get('X-Mooncci-Signature') || '');
  if (!/^[a-f0-9]{64}$/i.test(key) || !/^\d{10}$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/i.test(signature)) {
    return res.status(401).json({ message: 'Agent authentication failed.' });
  }
  const expected = crypto.createHmac('sha256', Buffer.from(key, 'hex'))
    .update(`${timestamp}\n${req.path}\n${JSON.stringify(req.body || {})}`).digest();
  if (!crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
    return res.status(401).json({ message: 'Agent authentication failed.' });
  }
  res.set('Cache-Control', 'private, no-store');
  next();
}

agentRouter.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
agentRouter.use(verifyAgent);
agentRouter.post('/claim', async (_req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(`SELECT m.user_id, m.mailbox_address, m.smtp_secret, m.provision_request_id
      FROM mailbox_access m JOIN users u ON u.id=m.user_id
      WHERE m.status='provisioning' AND m.provision_claimed_at IS NULL AND u.status='active'
      ORDER BY m.reviewed_at LIMIT 1 FOR UPDATE`);
    const job = rows[0];
    if (!job) {
      await connection.commit();
      return res.json({ job: null });
    }
    const password = open(job.smtp_secret, job.mailbox_address);
    await connection.query('UPDATE mailbox_access SET provision_claimed_at=NOW() WHERE user_id=?', [job.user_id]);
    await connection.commit();
    res.json({ job: {
      address: job.mailbox_address,
      password,
      requestId: job.provision_request_id,
    } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

agentRouter.post('/complete', async (req, res) => {
  const requestId = String(req.body.requestId || '');
  const address = String(req.body.address || '');
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || !email(address) || typeof req.body.created !== 'boolean') {
    return res.status(400).json({ message: 'Invalid job result.' });
  }
  if (req.body.created) {
    const [result] = await db.query(`UPDATE mailbox_access SET status='active', review_note=NULL
      WHERE provision_request_id=? AND mailbox_address=? AND status='provisioning' AND provision_claimed_at IS NOT NULL`, [requestId, address]);
    if (!result.affectedRows) return res.status(409).json({ message: 'Job state needs manual review.' });
  } else {
    await db.query(`UPDATE mailbox_access SET review_note='邮局未确认创建成功，请站长核对邮局日志。'
      WHERE provision_request_id=? AND mailbox_address=? AND status='provisioning'`, [requestId, address]);
  }
  res.json({ acknowledged: true });
});

router.use(authRequired);
router.use(rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));

function publicAccess(row) {
  if (!row) return null;
  const { smtp_secret: _secret, ...safe } = row;
  return safe;
}

router.get('/me', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM mailbox_access WHERE user_id=? LIMIT 1', [req.user.id]);
  res.json({ access: publicAccess(rows[0]) });
});

router.post('/apply', async (req, res) => {
  const requested = localPart(req.body.localPart);
  const reason = String(req.body.reason || '').trim();
  if (!requested || reason.length < 10 || reason.length > 1000) {
    return res.status(400).json({ message: '邮箱前缀需为 3–32 位字母、数字、点或连接符；申请说明需为 10–1000 字。' });
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query('SELECT status FROM mailbox_access WHERE user_id=? FOR UPDATE', [req.user.id]);
    if (existing[0] && existing[0].status !== 'rejected') {
      await connection.rollback();
      return res.status(409).json({ message: '已有申请或邮箱权限，请查看当前状态。' });
    }
    if (existing[0]) {
      await connection.query(`UPDATE mailbox_access SET requested_local_part=?, reason=?, status='pending',
        reviewer_id=NULL, review_note=NULL, reviewed_at=NULL WHERE user_id=?`, [requested, reason, req.user.id]);
    } else {
      await connection.query('INSERT INTO mailbox_access (user_id, requested_local_part, reason) VALUES (?, ?, ?)', [req.user.id, requested, reason]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: '该邮箱前缀已被使用，请换一个。' });
    throw error;
  } finally {
    connection.release();
  }
  res.status(201).json({ message: '申请已提交，等待站长审核。' });
});

router.get('/admin/requests', ownerOnly, async (_req, res) => {
  const [rows] = await db.query(`SELECT m.user_id, u.username, u.email AS account_email, m.requested_local_part,
    m.reason, m.status, m.mailbox_address, m.daily_limit, m.review_note, m.created_at, m.reviewed_at
    FROM mailbox_access m JOIN users u ON u.id=m.user_id ORDER BY FIELD(m.status,'pending','provisioning','active','rejected','revoked'), m.created_at DESC LIMIT 200`);
  res.json({ requests: rows });
});

router.post('/admin/requests/:id/reject', ownerOnly, async (req, res) => {
  const note = String(req.body.note || '').trim().slice(0, 1000);
  const [result] = await db.query(`UPDATE mailbox_access SET status='rejected', reviewer_id=?, review_note=?, reviewed_at=NOW()
    WHERE user_id=? AND status='pending'`, [req.user.id, note, req.params.id]);
  if (!result.affectedRows) return res.status(409).json({ message: '申请状态已改变，请刷新后重试。' });
  res.json({ message: '申请已拒绝。' });
});

router.post('/admin/requests/:id/approve', ownerOnly, async (req, res) => {
  if (!process.env.MAILBOX_PROVISION_KEY || !process.env.MAILBOX_SECRET_KEY) {
    return res.status(503).json({ message: '邮局自动开通尚未配置；申请仍待审核。' });
  }
  const dailyLimit = Number(req.body.dailyLimit ?? 10);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 50) {
    return res.status(400).json({ message: '每日发送上限需为 1–50 封。' });
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: '申请编号无效。' });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(`SELECT m.requested_local_part FROM mailbox_access m
      JOIN users u ON u.id=m.user_id WHERE m.user_id=? AND m.status='pending' AND u.status='active' FOR UPDATE`, [id]);
    if (!rows[0]) {
      await connection.rollback();
      return res.status(409).json({ message: '申请已处理或账号已停用，请刷新。' });
    }
    const address = `${rows[0].requested_local_part}@${DOMAIN}`;
    const password = `Aa9!${crypto.randomBytes(30).toString('base64url')}`;
    const requestId = crypto.randomUUID();
    const encrypted = seal(password, address);
    await connection.query(`UPDATE mailbox_access SET status='provisioning', mailbox_address=?, smtp_secret=?,
      provision_request_id=?, reviewer_id=?, reviewed_at=NOW(), daily_limit=?, review_note=NULL WHERE user_id=?`,
    [address, encrypted, requestId, req.user.id, dailyLimit, id]);
    await connection.commit();
    return res.status(202).json({ message: `${address} 已进入开通队列。邮局确认后才能发信。` });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

router.post('/admin/requests/:id/revoke', ownerOnly, async (req, res) => {
  const [result] = await db.query(`UPDATE mailbox_access SET status='revoked', smtp_secret=NULL, reviewer_id=?, reviewed_at=NOW()
    WHERE user_id=? AND status='active'`, [req.user.id, req.params.id]);
  if (!result.affectedRows) return res.status(409).json({ message: '邮箱权限已改变，请刷新。' });
  res.json({ message: '网页发信权限已撤销。邮局账号仍需单独停用。' });
});

router.get('/sent', async (req, res) => {
  const [rows] = await db.query(`SELECT id, recipient_email, subject, status, created_at FROM mailbox_send_logs
    WHERE user_id=? ORDER BY created_at DESC LIMIT 50`, [req.user.id]);
  res.json({ messages: rows });
});

router.post('/send', async (req, res) => {
  const to = email(req.body.to);
  const subject = header(req.body.subject);
  const content = String(req.body.content || '').trim();
  if (!to || !subject || !content || content.length > 10000) {
    return res.status(400).json({ message: '请填写有效收件人、120 字以内标题和 10000 字以内正文。' });
  }
  const connection = await db.getConnection();
  let account;
  let logId;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(`SELECT m.mailbox_address, m.smtp_secret, m.daily_limit
      FROM mailbox_access m JOIN users u ON u.id=m.user_id WHERE m.user_id=? AND m.status='active' AND u.status='active' FOR UPDATE`, [req.user.id]);
    account = rows[0];
    if (!account) {
      await connection.rollback();
      return res.status(403).json({ message: '邮箱尚未开通或发信权限已撤销。' });
    }
    const [count] = await connection.query(`SELECT COUNT(*) AS used FROM mailbox_send_logs
      WHERE user_id=? AND created_at>=CURRENT_DATE() AND created_at<DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY)`, [req.user.id]);
    if (Number(count[0].used) >= account.daily_limit) {
      await connection.rollback();
      return res.status(429).json({ message: '今日发送额度已用完，请明天再试。' });
    }
    logId = crypto.randomUUID();
    await connection.query(`INSERT INTO mailbox_send_logs (id,user_id,mailbox_address,recipient_email,subject,status)
      VALUES (?,?,?,?,?,'sending')`, [logId, req.user.id, account.mailbox_address, to, subject]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  try {
    const host = process.env.MAILBOX_SMTP_HOST;
    if (!host) throw new Error('MAILBOX_SMTP_HOST is not configured');
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.MAILBOX_SMTP_PORT || 465),
      secure: true,
      requireTLS: true,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      auth: { user: account.mailbox_address, pass: open(account.smtp_secret, account.mailbox_address) },
    });
    const info = await transporter.sendMail({
      from: account.mailbox_address,
      to,
      subject,
      text: content,
      envelope: { from: account.mailbox_address, to: [to] },
    });
    if (!info.accepted?.some(address => address.toLowerCase() === to)) {
      throw new Error('SMTP did not accept the recipient');
    }
    await db.query("UPDATE mailbox_send_logs SET status='accepted' WHERE id=?", [logId]);
    res.json({ message: '邮件已提交给邮局。对方是否收件仍取决于后续投递。', id: logId });
  } catch (error) {
    console.error('[mailboxes/send]', { id: logId, code: error.code || 'SMTP_ERROR' });
    await db.query("UPDATE mailbox_send_logs SET status='uncertain' WHERE id=?", [logId]);
    res.status(502).json({ message: '发送结果未确认。草稿已保留，请先查发送记录或邮局日志，避免重复发送。', id: logId });
  }
});

module.exports = { router, agentRouter };
