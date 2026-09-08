async function attemptNotification(send) {
  try {
    const result = await send();
    return result?.sent ? { status: 'sent' } : { status: 'skipped', reason: result?.reason || '邮件未发送。' };
  } catch {
    // SMTP errors may include addresses or credentials. Keep the admin response and log generic.
    console.error('[admin/notification] 邮件发送失败，业务更新已保存。');
    return { status: 'failed', reason: '邮件发送失败，请检查邮件服务。' };
  }
}
function notificationMessage(base, notification) {
  if (notification.status === 'sent') return `${base}；通知邮件已提交发送`;
  if (notification.status === 'not_needed') return base;
  return `${base}；${notification.reason}`;
}
module.exports = { attemptNotification, notificationMessage };
