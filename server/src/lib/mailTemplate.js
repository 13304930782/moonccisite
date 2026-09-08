const { brandText } = require('./siteIdentity');
const COLORS = { background: '#fafafa', surface: '#ffffff', text: '#171717', muted: '#666666', border: '#e5e5e5' };
function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function htmlLines(value) { return escapeHtml(value).replace(/\r?\n/g, '<br>'); }
function safeHttpUrl(value, fallback = '') {
  const input = String(value || '').trim();
  if (/[\u0000-\u001f\u007f]/.test(input)) return fallback;
  try { const url = new URL(input); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : fallback; }
  catch { return fallback; }
}
function renderAction(action) {
  const url = safeHttpUrl(action?.url);
  if (!url) return '';
  const label = brandText(action.label || '打开链接');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin:20px 0 0;max-width:100%;"><tr><td style="border-radius:6px;background:${COLORS.text};text-align:center;mso-padding-alt:12px 20px;"><a data-mail-button="true" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;border:1px solid ${COLORS.text};border-radius:6px;background:${COLORS.text};padding:12px 20px;font-size:14px;font-weight:500;line-height:1.5;color:#ffffff !important;text-decoration:none !important;">${escapeHtml(label)}</a></td></tr></table>
<p data-mail-fallback="true" style="margin:12px 0 24px;color:${COLORS.muted};font-size:12px;line-height:1.8;word-break:break-all;overflow-wrap:anywhere;">如果“${escapeHtml(label)}”按钮无法使用，请复制下方完整链接到浏览器打开：<br><a href="${escapeHtml(url)}" style="color:${COLORS.muted};text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${escapeHtml(url)}</a></p>`;
}
// Authored free text can also contain links (custom emails, comments and excerpts).
// Keep these escaped and give each HTTP(S) link the same action/fallback treatment.
function renderText(value) {
  const actions = [];
  const text = String(value ?? '').replace(/https?:\/\/[^\s<>"'，。！？；（）]+/gi, url => {
    let end = url.length;
    while (end > 0 && '.,;!?'.includes(url[end - 1])) end--;
    const trailing = url.slice(end);
    const target = trailing ? url.slice(0, -trailing.length) : url;
    if (!safeHttpUrl(target)) return url;
    actions.push({ label: `打开链接 ${actions.length + 1}`, url: target });
    return `［链接 ${actions.length}］${trailing}`;
  });
  return `<div style="font-size:15px;line-height:1.8;color:${COLORS.text};word-break:break-word;overflow-wrap:anywhere;">${htmlLines(brandText(text))}</div>${actions.map(renderAction).join('')}`;
}
function renderDetails(details) {
  if (!Array.isArray(details) || !details.length) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-collapse:collapse;margin:24px 0;border-top:1px solid ${COLORS.border};">${details.map(item => `<tr><td style="width:28%;padding:12px 12px 12px 0;border-bottom:1px solid ${COLORS.border};font-size:13px;line-height:1.8;color:${COLORS.muted};vertical-align:top;word-break:break-word;">${escapeHtml(brandText(item.label))}</td><td style="padding:12px 0;border-bottom:1px solid ${COLORS.border};vertical-align:top;">${renderText(item.value ?? '—')}</td></tr>`).join('')}</table>`;
}
function renderBrandedEmail({ eyebrow = '通知', title, intro = '', paragraphs = [], details = [], callout, cta, actions = [], sections = [], footer = '' }) {
  const category = brandText(eyebrow).replace(/^mooncci\s*\/\s*/i, '');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(brandText(title))}</title></head>
<body style="margin:0;padding:0;background:${COLORS.background};color:${COLORS.text};font-family:Inter,Arial,'PingFang SC','Microsoft YaHei',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${COLORS.background};"><tr><td align="center" style="padding:24px 12px;">
<table data-mail-theme="mooncci" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;table-layout:fixed;border-collapse:collapse;background:${COLORS.surface};border:1px solid ${COLORS.border};">
<tr><td style="padding:24px;border-bottom:1px solid ${COLORS.border};"><div style="font-size:20px;font-weight:600;letter-spacing:-.5px;text-transform:none;color:${COLORS.text};">mooncci</div><div style="margin-top:8px;font-size:12px;line-height:1.6;color:${COLORS.muted};">${escapeHtml(category)}</div></td></tr>
<tr><td style="padding:28px 24px;word-break:break-word;overflow-wrap:anywhere;">
<h1 style="margin:0 0 20px;font-size:28px;line-height:1.4;font-weight:500;letter-spacing:-.5px;color:${COLORS.text};">${escapeHtml(brandText(title))}</h1>
${intro ? `<div style="margin-bottom:20px;">${renderText(intro)}</div>` : ''}
${(Array.isArray(paragraphs) ? paragraphs : []).map(p => `<div style="margin:0 0 16px;">${renderText(p)}</div>`).join('')}
${renderDetails(details)}
${callout ? `<div style="margin:24px 0;padding:16px;border-left:2px solid ${COLORS.border};background:${COLORS.background};">${callout.title ? `<div style="margin-bottom:8px;font-size:14px;font-weight:600;">${escapeHtml(brandText(callout.title))}</div>` : ''}${renderText(callout.body)}</div>` : ''}
${sections.map(section => `<h2 style="margin:32px 0 4px;font-size:19px;font-weight:500;line-height:1.5;">${escapeHtml(brandText(section.label))}</h2>${section.items.map(item => `<div style="padding:20px 0;border-bottom:1px solid ${COLORS.border};"><h3 style="margin:0 0 10px;font-size:17px;font-weight:500;line-height:1.6;">${escapeHtml(brandText(item.title))}</h3>${renderText(item.excerpt || '')}${renderAction({ label: item.actionLabel || '阅读全文', url: item.url })}</div>`).join('')}`).join('')}
${[...(cta ? [cta] : []), ...actions].map(renderAction).join('')}
</td></tr><tr><td style="padding:20px 24px;border-top:1px solid ${COLORS.border};font-size:12px;line-height:1.8;color:${COLORS.muted};text-transform:none;">mooncci · 个人技术手记${footer ? `<div style="margin-top:6px;">${renderText(footer)}</div>` : ''}</td></tr>
</table></td></tr></table></body></html>`;
}
module.exports = { escapeHtml, htmlLines, renderBrandedEmail, renderAction, safeHttpUrl };
