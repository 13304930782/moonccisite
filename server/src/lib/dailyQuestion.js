const crypto = require('node:crypto');

function shanghaiTime(now = Date.now()) {
  const local = new Date(now + 8 * 3600000);
  return { date: local.toISOString().slice(0, 10), hour: local.getUTCHours(), tomorrow: Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - 8 * 3600000 };
}
function previousDate(date) { return new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10); }
function validDate(date) { return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date; }
function cleanChoices(raw) {
  if (raw == null || (Array.isArray(raw) && !raw.some(item => typeof item === 'string' && item.trim()))) return null;
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 4 || raw.some(item => typeof item !== 'string' || !item.trim() || Array.from(item.trim()).length > 20)) throw Object.assign(new Error('请填写 2 至 4 个选项，每项最多 20 字。'), { status: 400 });
  const choices = raw.map(item => item.trim());
  if (new Set(choices).size !== choices.length) throw Object.assign(new Error('选项不能重复。'), { status: 400 });
  return choices;
}
function parseChoices(raw) { if (!raw) return null; try { return Array.isArray(raw) ? raw : JSON.parse(raw); } catch { return null; } }
function publicQuestion(row) { return { id: Number(row.id), text: row.text, choices: parseChoices(row.choices) }; }
function banned(content, words) { const text = String(content || '').toLocaleLowerCase(); return words.some(word => word && text.includes(String(word).toLocaleLowerCase())); }
const sensitive = /(?:https?:\/\/|www\.|@|(?:\d[\s-]*){5,}|微信|手机号|电话号码|身份证|邮箱地址)/i;
function aggregate(question, answers, bannedWords) {
  const choices = parseChoices(question.choices);
  if (choices) return { type: 'choice', total: answers.length, counts: choices.map((_, i) => answers.filter(answer => Number(answer.choice_index) === i && answer.choice_index !== null).length) };
  const frequencies = new Map();
  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
  for (const answer of answers) {
    const text = String(answer.text || '').trim();
    if (!text || banned(text, bannedWords) || sensitive.test(text)) continue;
    const seen = new Set(), wholeAnswer = text.replace(/[\p{P}\p{S}\s]/gu, '').toLocaleLowerCase();
    for (const part of segmenter.segment(text)) {
      const token = part.segment.trim();
      if (!part.isWordLike || Array.from(token).length < 2 || Array.from(token).length > 20 || token.toLocaleLowerCase() === wholeAnswer || sensitive.test(token) || banned(token, bannedWords)) continue;
      seen.add(token);
    }
    for (const token of seen) frequencies.set(token, (frequencies.get(token) || 0) + 1);
  }
  return { type: 'wordcloud', total: answers.length, words: [...frequencies].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN')).slice(0, 30).map(([text, count]) => ({ text, count })) };
}
function summaryText(question, preview) {
  const lines = [`回答人数：${preview.total}`];
  if (preview.type === 'choice') parseChoices(question.choices).forEach((label, index) => lines.push(`${label}：${preview.counts[index]} 票`));
  else lines.push(preview.words.length ? `重复提及：${preview.words.map(word => `${word.text}（${word.count}）`).join('、')}` : '暂无足够重复的说法。');
  return lines.join('\n');
}
function cookieSignature(date, value, secret) { return crypto.createHmac('sha256', secret).update(`${date}:${value}`).digest('hex'); }
function validCookie(value, date, secret) {
  if (!secret || typeof value !== 'string' || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value)) return false;
  const [raw, signature] = value.split('.');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(cookieSignature(date, raw, secret), 'hex'));
}
function makeCookie(date, secret) { const raw = crypto.randomBytes(32).toString('hex'); return `${raw}.${cookieSignature(date, raw, secret)}`; }
function cookieKey(cookie) { return `anon:${crypto.createHash('sha256').update(cookie).digest('hex')}`; }
module.exports = { shanghaiTime, previousDate, validDate, cleanChoices, parseChoices, publicQuestion, aggregate, summaryText, makeCookie, validCookie, cookieKey };
