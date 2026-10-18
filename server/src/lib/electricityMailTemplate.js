const { escapeHtml, renderAction } = require('./mailTemplate');
const { mailFields, number } = require('./electricityReport');
const { finiteNumber } = require('./electricityMetrics');

// Electricity only: keep the shared mail palette and safe action rendering.
function renderElectricityDailyEmail({ report, label, test = false, url }) {
  const fields = mailFields(report);
  const total = finiteNumber(report.snapshot?.totalRemaining);
  const title = test ? '宿舍电量测试邮件' : `宿舍电量${label}`;
  const secondary = [fields[3], fields[2]];
  const card = ([name, value]) => {
    const split = value.indexOf('（');
    const main = split < 0 ? value : value.slice(0, split);
    const note = split < 0 ? '' : value.slice(split + 1, -1);
    return `<td width="50%" valign="top" style="padding:18px 16px;background:#f5f5f5;border-radius:16px;word-break:break-word;"><div style="font-size:12px;line-height:1.6;color:#666666;">${escapeHtml(name)}</div><div style="margin-top:8px;font-size:17px;font-weight:500;line-height:1.6;color:#171717;">${escapeHtml(main)}</div>${note ? '<div style="margin-top:6px;font-size:12px;line-height:1.6;color:#666666;">' + escapeHtml(note) + '</div>' : ''}</td>`;
  };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#fafafa;color:#171717;font-family:Inter,Arial,'PingFang SC','Microsoft YaHei',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;"><tr><td align="center" style="padding:24px 12px;">
<table data-mail-theme="mooncci" data-electricity-mail="v2" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;table-layout:fixed;background:#ffffff;border-radius:24px;"><tr><td style="padding:28px 24px;word-break:break-word;overflow-wrap:anywhere;">
<div style="font-size:20px;font-weight:600;letter-spacing:-.5px;">mooncci</div>
<h1 style="margin:24px 0 6px;font-size:22px;font-weight:500;line-height:1.5;">${escapeHtml(title)}</h1>
<p style="margin:0 0 24px;color:#666666;font-size:13px;line-height:1.8;">${escapeHtml(report.collectionStatus || '采集状态未知')}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px;background:#f5f5f5;border-radius:20px;">
<div style="font-size:14px;color:#666666;">当前总余量</div>
<div data-electricity-total style="margin-top:8px;font-size:48px;font-weight:600;line-height:1.2;letter-spacing:-1.5px;">${total === null ? '未提供' : escapeHtml(number(total))}${total === null ? '' : '<span style="font-size:16px;font-weight:400;letter-spacing:0;color:#666666;"> kWh</span>'}</div>
<p style="margin:14px 0 0;font-size:13px;line-height:1.8;color:#666666;">已购 / 补贴余量 · ${escapeHtml(fields[1][1])}</p>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;table-layout:fixed;"><tr>${secondary.map(card).join('<td width="12" style="width:12px;"></td>')}</tr></table>
<p style="margin:22px 0 0;color:#666666;font-size:12px;line-height:1.8;">采集时间 · ${escapeHtml(fields[4][1])}</p>
${renderAction({ label: '查看电量', url })}
<p style="margin:24px 0 0;font-size:12px;line-height:1.8;color:#666666;">mooncci · 宿舍电量监控<br>北京时间采集，预测仅供参考。</p>
</td></tr></table></td></tr></table></body></html>`;
}
module.exports = { renderElectricityDailyEmail };
