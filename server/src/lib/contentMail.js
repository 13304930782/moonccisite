const { renderBrandedEmail } = require('./mailTemplate');
function subscriptionConfirmation(url) {
  return {
    text: `确认订阅 mooncci 周报\n\n确认后，每周一北京时间 09:00 有更新时发送上周摘要。此链接 24 小时内有效。\n\n确认订阅：${url}\n\n如果不是你本人操作，请忽略此邮件。`,
    html: renderBrandedEmail({ eyebrow: '邮件订阅', title: '确认订阅 mooncci 周报', intro: '再确认一步，就能收到文章、近况与作品进展。', paragraphs: ['确认后，每周一北京时间 09:00 有更新时发送上周摘要，没有新内容时不发送。', '确认链接在 24 小时内有效。如果不是你本人操作，请忽略此邮件。'], cta: { label: '确认订阅', url } }),
  };
}
function newsletterMessage(items, origin, unsubscribe) {
  const sections = [['post','文章','阅读文章'],['update','近况','查看近况'],['release','项目版本','查看项目版本']]
    .map(([type,label,actionLabel]) => ({ label, items: items.filter(i => i.type === type).map(i => ({ ...i, actionLabel, url: origin + i.path })) }))
    .filter(group => group.items.length);
  return {
    text: ['mooncci · 本周更新', ...sections.flatMap(group => [group.label, ...group.items.map(i => `${i.title}\n${i.excerpt}\n${i.actionLabel}：${i.url}`)]), `你收到此邮件是因为确认订阅了 mooncci。\n取消订阅：${unsubscribe}`].join('\n\n'),
    html: renderBrandedEmail({ eyebrow: '邮件周报', title: '本周更新', intro: '上周的文章、近况与作品进展，整理在这里。', sections, actions: [{ label: '取消订阅', url: unsubscribe }], footer: '你收到此邮件是因为确认订阅了 mooncci 周报。' }),
  };
}
module.exports = { subscriptionConfirmation, newsletterMessage };
