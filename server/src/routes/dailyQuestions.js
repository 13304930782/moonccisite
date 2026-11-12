const crypto = require('node:crypto');
const asyncRouter = require('../lib/asyncRouter');
const { authRequired, adminOnly, getUserFromRequest } = require('../middleware/auth');
const { authCookieOptions } = require('../lib/authSession');
const rules = require('../lib/dailyQuestion');
const COOKIE = 'mooncci_daily_answer';
const fail = (status, message) => Object.assign(new Error(message), { status });

function createDailyRouters({ db = require('../db'), getUser = getUserFromRequest, now = Date.now, secret = () => process.env.JWT_SECRET, notify = notifyOpenAnswer } = {}) {
  const router = asyncRouter(), admin = asyncRouter();
  const noCache = (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.vary('Cookie'); res.vary('Authorization'); next(); };
  router.use(noCache); admin.use(authRequired, adminOnly, noCache);
  const byDate = async (query, date, lock = false) => {
    const [rows] = await query.query(`SELECT *, DATE_FORMAT(question_date,'%Y-%m-%d') AS question_date FROM daily_questions WHERE question_date=?${lock ? ' FOR UPDATE' : ''}`, [date]);
    return rows[0] || null;
  };
  const answerRows = async (query, id) => (await query.query('SELECT choice_index, text FROM daily_answers WHERE question_id=?', [id]))[0];
  const bannedWords = async query => (await query.query('SELECT word FROM banned_words'))[0].map(row => row.word);
  async function transaction(fn) {
    const conn = await db.getConnection();
    try { await conn.beginTransaction(); const result = await fn(conn); await conn.commit(); return result; }
    catch (error) { await conn.rollback(); throw error; }
    finally { conn.release(); }
  }
  async function identity(req, res, time) {
    let user;
    try { user = await getUser(req); }
    catch (error) { if (!['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) throw error; }
    if (user?.status === 'active') return `user:${user.id}`;
    const key = secret();
    if (!key) throw fail(503, '暂时无法记录回答，请稍后重试。');
    const cookie = String(req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    let value = cookie;
    if (!rules.validCookie(value, time.date, key)) {
      value = rules.makeCookie(time.date, key);
      res.cookie(COOKIE, value, { ...authCookieOptions(req), path: '/api/daily-question', maxAge: Math.max(1000, time.tomorrow - now()), domain: undefined });
    }
    return rules.cookieKey(value);
  }
  async function preview(query, question) { return rules.aggregate(question, await answerRows(query, question.id), await bannedWords(query)); }
  async function publicPreview(query, question) {
    const result = await preview(query, question);
    if (result.type !== 'wordcloud') return result;
    if (question.summary_status !== 'approved' || !question.summary) return { ...result, words: [], pendingReview: true };
    const approved = new Map([...question.summary.matchAll(/([^、\n：]+)（(\d+)）/gu)].map(match => [match[1], Number(match[2])]));
    return { ...result, words: result.words.filter(word => approved.get(word.text) === word.count) };
  }
  function adminShape(row) {
    if (!row) return null;
    return { id: Number(row.id), question_date: row.question_date, text: row.text, choices: rules.parseChoices(row.choices), status: row.status, answer_count: Number(row.answer_count || 0), summary_status: row.summary_status, summary: row.summary_status === 'approved' ? row.summary : null, draft_summary: ['pending', 'rejected'].includes(row.summary_status) ? row.summary : null };
  }
  async function detail(query, date) {
    const row = await byDate(query, date);
    if (!row) return null;
    const [[count]] = await query.query('SELECT COUNT(*) AS total FROM daily_answers WHERE question_id=?', [row.id]);
    return adminShape({ ...row, answer_count: count.total });
  }
  router.get('/', async (req, res) => {
    const time = rules.shanghaiTime(now());
    if (time.hour < 10 || time.hour >= 23) return res.json({ active: false });
    const question = await byDate(db, time.date);
    if (!question || question.status !== 'published') return res.json({ active: false });
    const key = await identity(req, res, time);
    const [rows] = await db.query('SELECT id FROM daily_answers WHERE question_id=? AND dedupe_key=? LIMIT 1', [question.id, key]);
    res.json({ active: true, ...rules.publicQuestion(question), answered: rows.length > 0 });
  });
  router.post('/answers', async (req, res) => {
    const time = rules.shanghaiTime(now());
    if (time.hour < 9 || time.hour >= 23) throw fail(403, '当前不在回答时间内。');
    const key = await identity(req, res, time);
    const result = await transaction(async conn => {
      const question = await byDate(conn, time.date, true);
      if (!question || question.status !== 'published') throw fail(403, '今天没有可回答的问题。');
      const choices = rules.parseChoices(question.choices), body = req.body || {};
      let index = null, text = null;
      if (choices) {
        if (!Number.isInteger(body.choiceIndex) || body.choiceIndex < 0 || body.choiceIndex >= choices.length || body.text != null) throw fail(400, '请选择有效选项。');
        index = body.choiceIndex;
      } else {
        if (body.choiceIndex != null || typeof body.text !== 'string' || !body.text.trim() || Array.from(body.text.trim()).length > 80) throw fail(400, '请输入 1 至 80 字的回答。');
        text = body.text.trim();
      }
      try { await conn.query('INSERT INTO daily_answers (question_id, choice_index, text, dedupe_key) VALUES (?, ?, ?, ?)', [question.id, index, text, key]); }
      catch (error) { if (error.code === 'ER_DUP_ENTRY') throw fail(409, '今天已经回答过了。'); throw error; }
      // A response after generation makes the old draft and any approval stale.
      if (question.summary_status !== 'none') await conn.query("UPDATE daily_questions SET summary=NULL, summary_status='none' WHERE id=?", [question.id]);
      return { result: await publicPreview(conn, { ...question, summary_status: 'none' }), open: !choices };
    });
    if (result.open) void notify().catch(() => console.error('[daily-question] 审核邮件发送失败。'));
    res.json({ accepted: true, preview: result.result });
  });
  router.get('/preview', async (req, res) => {
    const time = rules.shanghaiTime(now()), question = await byDate(db, time.date);
    if (!question || !['published', 'closed'].includes(question.status)) throw fail(404, '今天没有可查看的回答。');
    const key = await identity(req, res, time);
    const [rows] = await db.query('SELECT id FROM daily_answers WHERE question_id=? AND dedupe_key=? LIMIT 1', [question.id, key]);
    if (!rows.length) throw fail(403, '回答后才能查看汇总。');
    res.json({ preview: await publicPreview(db, question) });
  });
  router.get('/summary', async (_req, res) => {
    const question = await byDate(db, rules.previousDate(rules.shanghaiTime(now()).date));
    res.json({ summary: question?.summary_status === 'approved' && ['published', 'closed'].includes(question.status) ? question.summary : null });
  });
  admin.get('/', async (req, res) => {
    const today = rules.shanghaiTime(now()).date, date = req.query.date || today;
    if (!rules.validDate(date)) throw fail(400, '日期格式无效。');
    const [rows] = await db.query("SELECT q.*, DATE_FORMAT(q.question_date,'%Y-%m-%d') AS question_date, COUNT(a.id) AS answer_count FROM daily_questions q LEFT JOIN daily_answers a ON a.question_id=q.id WHERE q.question_date BETWEEN DATE_SUB(?, INTERVAL 6 DAY) AND ? GROUP BY q.id ORDER BY q.question_date DESC", [today, today]);
    res.json({ items: rows.map(adminShape), question: await detail(db, date) });
  });
  admin.put('/:date', async (req, res) => {
    const date = req.params.date, text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!rules.validDate(date) || !text || Array.from(text).length > 40) throw fail(400, '请输入有效日期和 1 至 40 字的问题。');
    const choices = rules.cleanChoices(req.body.choices);
    await transaction(async conn => {
      const current = await byDate(conn, date, true);
      if (current && current.status !== 'draft') throw fail(409, '已发布的问题不能修改。');
      if (current) await conn.query('UPDATE daily_questions SET text=?, choices=? WHERE id=?', [text, choices ? JSON.stringify(choices) : null, current.id]);
      else await conn.query("INSERT INTO daily_questions (question_date, text, choices, status) VALUES (?, ?, ?, 'draft')", [date, text, choices ? JSON.stringify(choices) : null]);
    });
    res.json({ question: await detail(db, date) });
  });
  admin.delete('/:date', async (req, res) => {
    const date = req.params.date;
    if (!rules.validDate(date)) throw fail(400, '日期格式无效。');
    await transaction(async conn => {
      const question = await byDate(conn, date, true);
      if (!question) throw fail(404, '题目不存在。');
      await conn.query('DELETE FROM daily_questions WHERE id=?', [question.id]);
    });
    res.json({ deleted: true });
  });
  admin.post('/:date/publish', async (req, res) => {
    const date = req.params.date;
    if (!rules.validDate(date)) throw fail(400, '日期格式无效。');
    await transaction(async conn => {
      const question = await byDate(conn, date, true);
      if (!question || question.status !== 'draft') throw fail(409, '只有草稿可以发布。');
      await conn.query("UPDATE daily_questions SET status='published' WHERE id=?", [question.id]);
    });
    res.json({ question: await detail(db, date) });
  });
  admin.post('/:date/generate', async (req, res) => {
    const date = req.params.date, time = rules.shanghaiTime(now());
    if (!rules.validDate(date)) throw fail(400, '日期格式无效。');
    if (date > time.date || (date === time.date && time.hour < 22)) throw fail(403, '当天 22:00 后才能生成总结。');
    await transaction(async conn => {
      const question = await byDate(conn, date, true);
      if (!question || !['published', 'closed'].includes(question.status)) throw fail(409, '请先发布问题。');
      const content = rules.summaryText(question, await preview(conn, question));
      await conn.query("UPDATE daily_questions SET summary=?, summary_status='pending' WHERE id=?", [content, question.id]);
    });
    res.json({ question: await detail(db, date) });
  });
  admin.post('/:date/review', async (req, res) => {
    const date = req.params.date, decision = req.body?.decision;
    if (!rules.validDate(date) || !['approve', 'reject'].includes(decision)) throw fail(400, '审核操作无效。');
    await transaction(async conn => {
      const question = await byDate(conn, date, true);
      if (!question || !question.summary || !(question.summary_status === 'pending' || (question.summary_status === 'rejected' && decision === 'approve'))) throw fail(409, '没有可审核的总结。');
      await conn.query('UPDATE daily_questions SET summary_status=? WHERE id=?', [decision === 'approve' ? 'approved' : 'rejected', question.id]);
    });
    res.json({ question: await detail(db, date) });
  });
  const errors = (error, _req, res, _next) => { res.status(error.status || 503).json({ message: error.status ? error.message : '每日一问暂不可用，请稍后重试。' }); };
  router.use(errors); admin.use(errors);
  return { router, admin };
}
async function notifyOpenAnswer() {
  const { getMailConfig, sendMail, safeSiteUrl } = require('../lib/mailer');
  const config = await getMailConfig();
  if (!config.notify_to) throw Error('Review notification recipient not configured');
  const url = `${safeSiteUrl(config.site_url)}/admin/site-settings`;
  const result = await sendMail({ channel: 'notifications', to: config.notify_to, config, subject: '[mooncci] 每日一问有回答待审核', text: `每日一问收到一条开放回答。请在后台生成并审核词云总结。\n${url}` });
  if (!result.sent) throw Error('Review notification was not sent');
}
module.exports = { createDailyRouters };
