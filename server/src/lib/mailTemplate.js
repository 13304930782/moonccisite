const BRAND = {
  yellow: '#ffe17c',
  charcoal: '#171e19',
  sage: '#b7c6c2',
  white: '#ffffff',
  black: '#000000',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function htmlLines(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function safeHttpUrl(value, fallback = '') {
  const input = String(value || '').trim();

  try {
    const parsed = new URL(input);
    if (!['http:', 'https:'].includes(parsed.protocol)) return fallback;
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function renderDetails(details) {
  if (!Array.isArray(details) || details.length === 0) return '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px 0;border:2px solid ${BRAND.black};background:${BRAND.white};">
      ${details.map((item, index) => `
        <tr>
          <td style="width:130px;padding:12px 14px;border-bottom:${index === details.length - 1 ? '0' : `2px solid ${BRAND.black}`};background:${BRAND.sage};font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;vertical-align:top;color:${BRAND.black};">
            ${escapeHtml(item.label)}
          </td>
          <td style="padding:12px 14px;border-left:2px solid ${BRAND.black};border-bottom:${index === details.length - 1 ? '0' : `2px solid ${BRAND.black}`};font-size:14px;font-weight:650;line-height:1.65;vertical-align:top;color:${BRAND.charcoal};">
            ${htmlLines(item.value || '-')}
          </td>
        </tr>
      `).join('')}
    </table>
  `;
}

function renderBrandedEmail({
  eyebrow = 'MOONCCI / PROMPTDOCK',
  title,
  intro = '',
  paragraphs = [],
  details = [],
  callout,
  cta,
  footer = 'Mooncci · Independent technology and product studio',
}) {
  const ctaUrl = cta ? safeHttpUrl(cta.url) : '';
  const content = Array.isArray(paragraphs) ? paragraphs : [];

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.sage};color:${BRAND.charcoal};font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${BRAND.sage};">
      <tr>
        <td align="center" style="padding:30px 14px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;border-collapse:collapse;border:2px solid ${BRAND.black};background:${BRAND.white};">
            <tr>
              <td style="border-bottom:2px solid ${BRAND.black};background:${BRAND.yellow};padding:15px 20px;font-size:12px;font-weight:900;letter-spacing:.14em;color:${BRAND.black};">
                ${escapeHtml(eyebrow)}
              </td>
            </tr>
            <tr>
              <td style="padding:30px 26px 28px;">
                <h1 style="margin:0 0 18px;font-size:32px;line-height:1.12;font-weight:900;letter-spacing:-.035em;color:${BRAND.black};">${escapeHtml(title)}</h1>
                ${intro ? `<p style="margin:0 0 18px;font-size:16px;font-weight:700;line-height:1.75;color:${BRAND.charcoal};">${htmlLines(intro)}</p>` : ''}
                ${content.map((paragraph) => `<p style="margin:0 0 16px;font-size:14px;font-weight:600;line-height:1.75;color:${BRAND.charcoal};">${htmlLines(paragraph)}</p>`).join('')}
                ${renderDetails(details)}
                ${callout ? `
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:22px 0;border:2px solid ${BRAND.black};background:${BRAND.yellow};">
                    <tr><td style="padding:16px 18px;color:${BRAND.black};">
                      ${callout.title ? `<div style="margin-bottom:7px;font-size:14px;font-weight:900;">${escapeHtml(callout.title)}</div>` : ''}
                      <div style="font-size:13px;font-weight:650;line-height:1.7;">${htmlLines(callout.body)}</div>
                    </td></tr>
                  </table>
                ` : ''}
                ${ctaUrl ? `
                  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:26px;">
                    <tr>
                      <td style="border:2px solid ${BRAND.black};background:${BRAND.yellow};">
                        <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:13px 20px;background:${BRAND.yellow};color:${BRAND.black} !important;text-decoration:none !important;font-size:14px;font-weight:900;line-height:1.2;">${escapeHtml(cta.label)}</a>
                      </td>
                    </tr>
                  </table>
                ` : ''}
                ${ctaUrl ? `<p style="margin:20px 0 0;font-size:11px;font-weight:600;line-height:1.6;color:#4b554f;word-break:break-all;">按钮无法打开时，请复制：<br><span style="color:${BRAND.charcoal};">${escapeHtml(ctaUrl)}</span></p>` : ''}
              </td>
            </tr>
            <tr>
              <td style="border-top:2px solid ${BRAND.black};background:${BRAND.charcoal};padding:14px 20px;font-size:11px;font-weight:700;line-height:1.6;color:${BRAND.white};">
                ${escapeHtml(footer)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = {
  escapeHtml,
  htmlLines,
  renderBrandedEmail,
  safeHttpUrl,
};
