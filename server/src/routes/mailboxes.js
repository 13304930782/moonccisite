const crypto = require('crypto');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { authRequired, ownerOnly } = require('../middleware/auth');
const { DOMAIN, localPart, email, header, seal, open } = require('../lib/mailboxSecurity');
const mailboxImap = require('../lib/mailboxImap');
const mailTiming = require('../lib/mailboxTiming');
const { emailValid, hash, sessionHash } = require('../lib/accountSettings');
const { sendMail } = require('../lib/mailer');

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

agentRouter.post('/rotation-claim', async (_req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(`SELECT p.user_id, p.request_id, p.mailbox_address, p.new_secret
      FROM mailbox_password_changes p JOIN mailbox_access m ON m.user_id=p.user_id
      JOIN users u ON u.id=p.user_id
      WHERE (p.status='pending' OR (p.status='claimed' AND p.claimed_at<DATE_SUB(NOW(), INTERVAL 5 MINUTE)))
      AND m.status='active' AND m.mailbox_address=p.mailbox_address AND u.status='active'
      ORDER BY p.created_at LIMIT 1 FOR UPDATE`);
    const job = rows[0];
    if (!job) {
      await connection.commit();
      return res.json({ job: null });
    }
    const password = open(job.new_secret, job.mailbox_address);
    await connection.query("UPDATE mailbox_password_changes SET status='claimed', claimed_at=NOW() WHERE user_id=?", [job.user_id]);
    await connection.commit();
    mailboxImap.invalidate(job.user_id);
    res.json({ job: { address: job.mailbox_address, password, requestId: job.request_id } });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
});

agentRouter.post('/rotation-complete', async (req, res) => {
  const requestId = String(req.body?.requestId || '');
  const address = String(req.body?.address || '');
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || !email(address) || typeof req.body?.changed !== 'boolean') {
    return res.status(400).json({ message: 'Invalid job result.' });
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM mailbox_password_changes WHERE request_id=? AND mailbox_address=? FOR UPDATE', [requestId, address]);
    const job = rows[0];
    if (!job) { await connection.rollback(); return res.status(409).json({ message: 'Job state needs manual review.' }); }
    if (job.status === 'complete') { await connection.commit(); return res.json({ acknowledged: true }); }
    if (job.status !== 'claimed') { await connection.rollback(); return res.status(409).json({ message: 'Job state needs manual review.' }); }
    if (req.body.changed) {
      const [result] = await connection.query(`UPDATE mailbox_access SET smtp_secret=?
        WHERE user_id=? AND mailbox_address=? AND status='active'`, [job.new_secret, job.user_id, address]);
      if (result.affectedRows) {
        await connection.query("UPDATE mailbox_password_changes SET status='complete', new_secret=NULL WHERE user_id=?", [job.user_id]);
      } else {
        await connection.query("UPDATE mailbox_password_changes SET status='review' WHERE user_id=?", [job.user_id]);
      }
    } else {
      await connection.query("UPDATE mailbox_password_changes SET status='review' WHERE user_id=?", [job.user_id]);
    }
    await connection.commit();
    mailboxImap.invalidate(job.user_id);
    res.json({ acknowledged: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
});

router.use((req, res, next) => {
  const operation = req.method === 'POST' && /^\/send\/?$/.test(req.path) ? 'send'
    : req.method === 'GET' && /^\/folders\/[^/]+\/[^/]+\/?$/.test(req.path) ? 'read'
    : req.method === 'GET' && /^\/folders\/[^/]+\/?$/.test(req.path) ? 'list'
    : req.method === 'GET' && /^\/me\/?$/.test(req.path) ? 'account'
    : req.method === 'GET' && /^\/sent\/?$/.test(req.path) ? 'history' : null;
  return operation ? mailTiming.middleware(operation)(req, res, next) : next();
});
router.use(authRequired);
router.use(rateLimit({ windowMs: 60_000, limit: 30, skip: req => req.user?.role === 'owner',
  standardHeaders: true, legacyHeaders: false }));

const ownerConnectLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5,
  keyGenerator: req => String(req.user.id), standardHeaders: true, legacyHeaders: false });
const credentialCodeLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5,
  keyGenerator: req => String(req.user.id), standardHeaders: true, legacyHeaders: false });
const credentialActionLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 10,
  keyGenerator: req => String(req.user.id), standardHeaders: true, legacyHeaders: false });

router.post('/owner/connect', ownerOnly, ownerConnectLimiter, async (req, res) => {
  const address = `mooncci@${DOMAIN}`;
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
    return res.status(400).json({ message: '请输入现有 mooncci 邮箱的密码。' });
  }
  const host = process.env.MAILBOX_SMTP_HOST;
  if (!host || !process.env.MAILBOX_SECRET_KEY) {
    return res.status(503).json({ message: '邮箱连接尚未配置。' });
  }
  try {
    const transport = nodemailer.createTransport({ host,
      port: Number(process.env.MAILBOX_SMTP_PORT || 465), secure: true,
      connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 12000,
      auth: { user: address, pass: password } });
    await transport.verify();
    transport.close();
  } catch (_error) {
    return res.status(400).json({ message: '邮局未通过连接验证，请检查邮箱密码或稍后重试。' });
  }
  const secret = seal(password, address);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT status, mailbox_address FROM mailbox_access WHERE user_id=? FOR UPDATE', [req.user.id]);
    if (rows[0]?.status === 'active' && rows[0].mailbox_address !== address) {
      await connection.rollback();
      return res.status(409).json({ message: '当前账号已有其他可用邮箱，请先撤销原有网页发信权限。' });
    }
    if (rows[0]) {
      await connection.query(`UPDATE mailbox_access SET requested_local_part='mooncci', reason='站长连接现有邮箱',
        status='active', mailbox_address=?, smtp_secret=?, provision_request_id=NULL,
        provision_claimed_at=NULL, reviewer_id=?, review_note=NULL, reviewed_at=NOW(), daily_limit=0
        WHERE user_id=?`, [address, secret, req.user.id, req.user.id]);
    } else {
      await connection.query(`INSERT INTO mailbox_access
        (user_id,requested_local_part,reason,status,mailbox_address,smtp_secret,daily_limit,reviewer_id,reviewed_at)
        VALUES (?,'mooncci','站长连接现有邮箱','active',?,?,0,?,NOW())`,
      [req.user.id, address, secret, req.user.id]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'mooncci 邮箱已关联其他网站账号。' });
    throw error;
  } finally {
    connection.release();
  }
  mailboxImap.invalidate(req.user.id);
  res.json({ message: '现有 mooncci 邮箱已连接，可以从网页发信。' });
});

router.post('/owner/disconnect', ownerOnly, async (req, res) => {
  const [result] = await db.query(`UPDATE mailbox_access SET status='revoked', smtp_secret=NULL,
    reviewer_id=?, reviewed_at=NOW() WHERE user_id=? AND mailbox_address=? AND status='active'`,
  [req.user.id, req.user.id, `mooncci@${DOMAIN}`]);
  if (!result.affectedRows) return res.status(409).json({ message: '邮箱连接状态已改变，请刷新。' });
  mailboxImap.invalidate(req.user.id);
  res.json({ message: '网页发信连接已断开。原宝塔邮箱账号保持不变。' });
});

function publicAccess(row) {
  if (!row) return null;
  const { smtp_secret: _secret, ...safe } = row;
  return safe;
}

router.get('/me', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM mailbox_access WHERE user_id=? LIMIT 1', [req.user.id]);
  const access = publicAccess(rows[0]);
  if (access?.status === 'active') {
    const [changes] = await db.query('SELECT status FROM mailbox_password_changes WHERE user_id=? LIMIT 1', [req.user.id]);
    access.password_change_status = changes[0]?.status || 'idle';
  }
  if (access && req.user.role === 'owner') access.daily_limit = 0;
  res.set('Cache-Control', 'private, no-store');
  res.json({ access });
});

function validNewPassword(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128 &&
    /^[!-~]+$/.test(value) && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value);
}

async function verifyCredentialCode(connection, req) {
  const id = req.body?.challenge_id;
  const code = req.body?.code;
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id) || typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  const [rows] = await connection.query(`SELECT id,old_email,old_code_hash,attempts,expires_at FROM account_challenges
    WHERE id=? AND user_id=? AND session_hash=? AND purpose='mailbox_password' FOR UPDATE`,
  [id, req.user.id, sessionHash(req)]);
  const item = rows[0];
  if (!item || item.old_email !== req.user.email || item.expires_at <= Date.now() || item.attempts >= 5) return false;
  const actual = Buffer.from(hash(`${id}:${code}`), 'hex');
  const expected = Buffer.from(item.old_code_hash, 'hex');
  if (!crypto.timingSafeEqual(actual, expected)) {
    await connection.query('UPDATE account_challenges SET attempts=attempts+1 WHERE id=?', [id]);
    return false;
  }
  await connection.query('DELETE FROM account_challenges WHERE id=?', [id]);
  return true;
}

router.post('/credentials/code', credentialCodeLimiter, async (req, res) => {
  if (!emailValid(req.user.email)) return res.status(409).json({ message: '请先设置可接收验证码的登录邮箱。' });
  const [access] = await db.query("SELECT user_id FROM mailbox_access WHERE user_id=? AND status='active' LIMIT 1", [req.user.id]);
  if (!access.length) return res.status(403).json({ message: '邮箱尚未开通。' });
  const id = crypto.randomBytes(32).toString('hex');
  const code = crypto.randomInt(100000, 1000000).toString();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [recent] = await connection.query(`SELECT id FROM account_challenges
      WHERE user_id=? AND purpose='mailbox_password' AND created_at>? FOR UPDATE`, [req.user.id, Date.now() - 60_000]);
    if (recent.length) { await connection.rollback(); return res.status(429).json({ message: '请间隔 60 秒再发送验证码。' }); }
    await connection.query("DELETE FROM account_challenges WHERE user_id=? AND purpose='mailbox_password'", [req.user.id]);
    await connection.query(`INSERT INTO account_challenges
      (id,user_id,session_hash,purpose,old_email,old_code_hash,created_at,expires_at)
      VALUES (?,?,?,'mailbox_password',?,?,?,?)`,
    [id, req.user.id, sessionHash(req), req.user.email, hash(`${id}:${code}`), Date.now(), Date.now() + 600_000]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  try {
    const result = await sendMail({ to: req.user.email, subject: '[mooncci] 验证邮箱密码操作',
      text: `验证码：${code}，10 分钟内有效。用于查看或修改 ${DOMAIN} 邮箱密码；如果不是你本人操作，请忽略。` });
    if (!result.sent) throw new Error('Mail not sent');
  } catch {
    await db.query('UPDATE account_challenges SET expires_at=0 WHERE id=?', [id]);
    return res.status(503).json({ message: '验证码发送失败，请稍后重试。' });
  }
  res.set('Cache-Control', 'private, no-store');
  res.json({ challenge_id: id, message: '验证码已发送到登录邮箱，10 分钟内有效。' });
});

router.post('/credentials/reveal', credentialActionLimiter, async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(`SELECT m.mailbox_address,m.smtp_secret,p.status AS change_status
      FROM mailbox_access m LEFT JOIN mailbox_password_changes p ON p.user_id=m.user_id
      WHERE m.user_id=? AND m.status='active' FOR UPDATE`, [req.user.id]);
    const account = rows[0];
    if (!account) { await connection.rollback(); return res.status(403).json({ message: '邮箱尚未开通。' }); }
    if (account.change_status && account.change_status !== 'complete') {
      await connection.rollback(); return res.status(409).json({ message: '密码更新尚未确认，暂时不能查看。' });
    }
    if (!await verifyCredentialCode(connection, req)) {
      await connection.commit(); return res.status(400).json({ message: '验证码无效或已过期。' });
    }
    const password = open(account.smtp_secret, account.mailbox_address);
    await connection.commit();
    res.set('Cache-Control', 'private, no-store');
    res.json({ password });
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
});

router.post('/credentials/change', credentialActionLimiter, async (req, res) => {
  const password = req.body?.password;
  if (!validNewPassword(password)) return res.status(400).json({ message: '新密码需为 12–128 位，包含大小写字母和数字，不含空格。' });
  if (!process.env.MAILBOX_PROVISION_KEY || !process.env.MAILBOX_SECRET_KEY) {
    return res.status(503).json({ message: '邮局密码更新服务尚未配置。' });
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(`SELECT m.mailbox_address,m.smtp_secret,p.status AS change_status
      FROM mailbox_access m LEFT JOIN mailbox_password_changes p ON p.user_id=m.user_id
      WHERE m.user_id=? AND m.status='active' FOR UPDATE`, [req.user.id]);
    const account = rows[0];
    if (!account) { await connection.rollback(); return res.status(403).json({ message: '邮箱尚未开通。' }); }
    if (account.change_status && account.change_status !== 'complete') {
      await connection.rollback(); return res.status(409).json({ message: '已有密码更新待邮局确认，请先等待或联系站长。' });
    }
    if (open(account.smtp_secret, account.mailbox_address) === password) {
      await connection.rollback(); return res.status(400).json({ message: '新密码不能与当前密码相同。' });
    }
    if (!await verifyCredentialCode(connection, req)) {
      await connection.commit(); return res.status(400).json({ message: '验证码无效或已过期。' });
    }
    const requestId = crypto.randomUUID();
    await connection.query(`INSERT INTO mailbox_password_changes (user_id,request_id,mailbox_address,new_secret,status,claimed_at)
      VALUES (?,?,?,?,'pending',NULL) ON DUPLICATE KEY UPDATE request_id=VALUES(request_id),
      mailbox_address=VALUES(mailbox_address),new_secret=VALUES(new_secret),status='pending',claimed_at=NULL`,
    [req.user.id, requestId, account.mailbox_address, seal(password, account.mailbox_address)]);
    await connection.commit();
    mailboxImap.invalidate(req.user.id);
    res.status(202).json({ message: '已提交密码更新，邮局确认后生效。生效后请更新邮件客户端中的密码。' });
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
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

router.get('/admin/requests', ownerOnly, async (req, res) => {
  const statuses = new Set(['pending', 'provisioning', 'active', 'rejected', 'revoked', 'all']);
  const status = statuses.has(req.query.status) ? req.query.status : 'pending';
  const query = String(req.query.q || '').trim().slice(0, 80);
  const page = Math.min(Math.max(Number.parseInt(req.query.page, 10) || 1, 1), 10000);
  const limit = 20;
  const conditions = ["u.role <> 'owner'"];
  const values = [];
  if (status !== 'all') { conditions.push('m.status=?'); values.push(status); }
  if (query) {
    conditions.push(`(u.username LIKE ? OR u.email LIKE ? OR m.requested_local_part LIKE ? OR m.mailbox_address LIKE ?)`);
    values.push(...Array(4).fill(`%${query.replace(/[\\%_]/g, '\\$&')}%`));
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [[[totalRow]], [requests], [counts]] = await Promise.all([
    db.query(`SELECT COUNT(*) AS total FROM mailbox_access m JOIN users u ON u.id=m.user_id ${where}`, values),
    db.query(`SELECT m.user_id, u.username, u.email AS account_email, m.requested_local_part,
      m.reason, m.status, m.mailbox_address, m.daily_limit, m.review_note, m.created_at, m.reviewed_at
      FROM mailbox_access m JOIN users u ON u.id=m.user_id ${where}
      ORDER BY ${status === 'all'
    ? "CASE WHEN m.status='pending' THEN 0 ELSE 1 END, CASE WHEN m.status='pending' THEN m.created_at END ASC, m.created_at DESC, m.user_id DESC"
    : status === 'pending' ? 'm.created_at ASC, m.user_id ASC' : 'm.created_at DESC, m.user_id DESC'} LIMIT ? OFFSET ?`,
    [...values, limit, (page - 1) * limit]),
    db.query(`SELECT m.status, COUNT(*) AS count FROM mailbox_access m JOIN users u ON u.id=m.user_id
      WHERE u.role <> 'owner' GROUP BY m.status`),
  ]);
  res.json({ requests, total: Number(totalRow.total), page, limit,
    counts: Object.fromEntries(counts.map(row => [row.status, Number(row.count)])) });
});

router.post('/admin/requests/batch-approve', ownerOnly, async (req, res) => {
  if (!process.env.MAILBOX_PROVISION_KEY || !process.env.MAILBOX_SECRET_KEY) {
    return res.status(503).json({ message: '邮局自动开通尚未配置。' });
  }
  const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map(Number))] : [];
  const dailyLimit = Number(req.body.dailyLimit ?? 10);
  if (!ids.length || ids.length > 20 || ids.some(id => !Number.isSafeInteger(id) || id <= 0) ||
      !Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > 1000) {
    return res.status(400).json({ message: '每次最多选择 20 条待审申请；每日额度为 0（不限）或 1–1000 封。' });
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await connection.query(`SELECT m.user_id, m.requested_local_part FROM mailbox_access m
      JOIN users u ON u.id=m.user_id WHERE m.user_id IN (${placeholders}) AND m.status='pending'
      AND u.status='active' FOR UPDATE`, ids);
    if (rows.length !== ids.length) {
      await connection.rollback();
      return res.status(409).json({ message: '部分申请状态已改变，请刷新后重新选择。' });
    }
    for (const row of rows) {
      const address = `${row.requested_local_part}@${DOMAIN}`;
      const password = `Aa9!${crypto.randomBytes(30).toString('base64url')}`;
      await connection.query(`UPDATE mailbox_access SET status='provisioning', mailbox_address=?, smtp_secret=?,
        provision_request_id=?, reviewer_id=?, reviewed_at=NOW(), daily_limit=?, review_note=NULL WHERE user_id=?`,
      [address, seal(password, address), crypto.randomUUID(), req.user.id, dailyLimit, row.user_id]);
    }
    await connection.commit();
    res.status(202).json({ message: `${rows.length} 条申请已进入邮局开通队列。`, count: rows.length });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

router.post('/admin/requests/batch-reject', ownerOnly, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map(Number))] : [];
  if (!ids.length || ids.length > 20 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    return res.status(400).json({ message: '每次最多选择 20 条待审申请。' });
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await connection.query(`SELECT user_id FROM mailbox_access
      WHERE user_id IN (${placeholders}) AND status='pending' FOR UPDATE`, ids);
    if (rows.length !== ids.length) {
      await connection.rollback();
      return res.status(409).json({ message: '部分申请状态已改变，请刷新后重新选择。' });
    }
    await connection.query(`UPDATE mailbox_access SET status='rejected', reviewer_id=?,
      review_note='', reviewed_at=NOW() WHERE user_id IN (${placeholders})`, [req.user.id, ...ids]);
    await connection.commit();
    res.json({ message: `已拒绝 ${rows.length} 条申请。`, count: rows.length });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
  if (!Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > 1000) {
    return res.status(400).json({ message: '每日额度为 0（不限）或 1–1000 封。' });
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

router.post('/admin/requests/:id/limit', ownerOnly, async (req, res) => {
  const id = Number(req.params.id);
  const dailyLimit = req.body?.dailyLimit;
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > 1000) {
    return res.status(400).json({ message: '每日额度为 0（不限）或 1–1000 封。' });
  }
  const [result] = await db.query(`UPDATE mailbox_access m JOIN users u ON u.id=m.user_id
    SET m.daily_limit=? WHERE m.user_id=? AND m.status='active' AND u.role <> 'owner'`, [dailyLimit, id]);
  if (!result.affectedRows) return res.status(409).json({ message: '邮箱状态已改变，请刷新后重试。' });
  res.json({ message: dailyLimit === 0 ? '已取消该用户的每日发信上限。' : `每日发信上限已设为 ${dailyLimit} 封。` });
});

router.post('/admin/requests/:id/revoke', ownerOnly, async (req, res) => {
  const [result] = await db.query(`UPDATE mailbox_access SET status='revoked', smtp_secret=NULL, reviewer_id=?, reviewed_at=NOW()
    WHERE user_id=? AND status='active'`, [req.user.id, req.params.id]);
  if (!result.affectedRows) return res.status(409).json({ message: '邮箱权限已改变，请刷新。' });
  mailboxImap.invalidate(req.params.id);
  res.json({ message: '网页发信权限已撤销。邮局账号仍需单独停用。' });
});

router.get('/sent', async (req, res) => {
  const [rows] = await db.query(`SELECT id, recipient_email, subject, status, created_at FROM mailbox_send_logs
    WHERE user_id=? ORDER BY created_at DESC LIMIT 50`, [req.user.id]);
  res.json({ messages: rows });
});

async function activeAccount(userId) {
  const [rows] = await db.query(`SELECT m.mailbox_address, m.smtp_secret, p.status AS change_status FROM mailbox_access m
    JOIN users u ON u.id=m.user_id LEFT JOIN mailbox_password_changes p ON p.user_id=m.user_id
    WHERE m.user_id=? AND m.status='active' AND u.status='active' LIMIT 1`, [userId]);
  return rows[0];
}

function mailboxError(error, res) {
  console.error('[mailboxes/imap]', { code: error.code || 'IMAP_ERROR' });
  res.status(502).json({ message: '暂时无法连接邮局，请稍后刷新。' });
}

router.get('/folders/:folder', async (req, res) => {
  if (!['inbox', 'sent'].includes(req.params.folder)) return res.status(404).json({ message: '邮箱文件夹不存在。' });
  const page = Number(req.query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) return res.status(400).json({ message: '页码无效。' });
  const account = await req.mailTiming.measure('account_lookup_ms', () => activeAccount(req.user.id));
  if (!account) return res.status(403).json({ message: '邮箱尚未开通。' });
  if (account.change_status && account.change_status !== 'complete') return res.status(409).json({ message: '邮箱密码更新待确认，请稍后刷新。' });
  res.set('Cache-Control', 'private, no-store');
  try { res.json(await mailboxImap.listMessages({ ...account, user_id: req.user.id, role: req.user.role }, req.params.folder, page, req.mailTiming)); }
  catch (error) { mailboxError(error, res); }
});

router.get('/folders/:folder/:uid', async (req, res) => {
  if (!['inbox', 'sent'].includes(req.params.folder)) return res.status(404).json({ message: '邮箱文件夹不存在。' });
  const uid = Number(req.params.uid);
  const uidValidity = String(req.query.uidValidity || '');
  if (!Number.isSafeInteger(uid) || uid < 1 || !/^\d{1,20}$/.test(uidValidity)) {
    return res.status(400).json({ message: '邮件编号无效。' });
  }
  const account = await req.mailTiming.measure('account_lookup_ms', () => activeAccount(req.user.id));
  if (!account) return res.status(403).json({ message: '邮箱尚未开通。' });
  if (account.change_status && account.change_status !== 'complete') return res.status(409).json({ message: '邮箱密码更新待确认，请稍后刷新。' });
  res.set('Cache-Control', 'private, no-store');
  try {
    const message = await mailboxImap.readMessage({ ...account, user_id: req.user.id, role: req.user.role }, req.params.folder, uid, uidValidity, req.mailTiming);
    if (!message) return res.status(404).json({ message: '邮件已移动或不存在，请刷新列表。' });
    res.json({ message });
  } catch (error) { mailboxError(error, res); }
});

router.post('/send', async (req, res) => {
  const to = email(req.body.to);
  const subject = header(req.body.subject);
  const content = String(req.body.content || '').trim();
  if (!to || !subject || !content || content.length > 10000) {
    return res.status(400).json({ message: '请填写有效收件人、120 字以内标题和 10000 字以内正文。' });
  }
  const connection = await req.mailTiming.measure('db_pool_wait_ms', () => db.getConnection());
  const finishPrepare = req.mailTiming.start('db_prepare_ms');
  let account;
  let logId;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(`SELECT m.mailbox_address, m.smtp_secret, m.daily_limit, p.status AS change_status
      FROM mailbox_access m JOIN users u ON u.id=m.user_id LEFT JOIN mailbox_password_changes p ON p.user_id=m.user_id
      WHERE m.user_id=? AND m.status='active' AND u.status='active' FOR UPDATE`, [req.user.id]);
    account = rows[0];
    if (!account) {
      await connection.rollback();
      return res.status(403).json({ message: '邮箱尚未开通或发信权限已撤销。' });
    }
    if (account.change_status && account.change_status !== 'complete') {
      await connection.rollback();
      return res.status(409).json({ message: '邮箱密码更新待确认，暂时不能发信。' });
    }
    if (req.user.role !== 'owner' && Number(account.daily_limit) > 0) {
      const [count] = await connection.query(`SELECT COUNT(*) AS used FROM mailbox_send_logs
        WHERE user_id=? AND created_at>=CURRENT_DATE() AND created_at<DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY)`, [req.user.id]);
      if (Number(count[0].used) >= account.daily_limit) {
        await connection.rollback();
        return res.status(429).json({ message: '今日发送额度已用完，请明天再试。' });
      }
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
    finishPrepare();
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
    const mail = {
      from: account.mailbox_address,
      to,
      subject,
      text: content,
      envelope: { from: account.mailbox_address, to: [to] },
    };
    const raw = await req.mailTiming.measure('mime_build_ms', () => new MailComposer(mail).compile().build());
    const info = await req.mailTiming.measure('smtp_submit_ms', () => transporter.sendMail({ raw, from: mail.from, to: mail.to, envelope: mail.envelope }));
    if (!info.accepted?.some(address => address.toLowerCase() === to)) {
      throw new Error('SMTP did not accept the recipient');
    }
    await req.mailTiming.measure('db_accept_ms', () => db.query("UPDATE mailbox_send_logs SET status='accepted' WHERE id=?", [logId]));
    let savedToSent = false;
    try { await mailboxImap.appendSent({ ...account, user_id: req.user.id, role: req.user.role }, raw, req.mailTiming); savedToSent = true; }
    catch (error) { console.error('[mailboxes/sent-copy]', { id: logId, code: error.code || 'IMAP_ERROR' }); }
    res.json({ message: savedToSent ? '邮件已发送并保存到已发送。' : '邮件已发送，但未能保存到已发送。', id: logId, savedToSent });
  } catch (error) {
    console.error('[mailboxes/send]', { id: logId, code: error.code || 'SMTP_ERROR' });
    await db.query("UPDATE mailbox_send_logs SET status='uncertain' WHERE id=?", [logId]);
    res.status(502).json({ message: '发送结果未确认。草稿已保留，请先查发送记录或邮局日志，避免重复发送。', id: logId });
  }
});

module.exports = { router, agentRouter };
