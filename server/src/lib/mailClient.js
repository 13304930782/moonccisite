const { randomUUID } = require('node:crypto');
const config = require('../config/mail-client.json');

function validateEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || /[\x00-\x20\x7f]/.test(value)) return null;
  const parts = value.split('@');
  if (parts.length !== 2 || parts[1].toLowerCase() !== config.domain || parts[0].length > 64 || !new RegExp(config.localPartPattern).test(parts[0])) return null;
  return `${parts[0]}@${config.domain}`;
}
const escapeXml = value => String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
function autoconfig() {
  const server = (name, type, settings) => `    <${name} type="${type}">\n      <hostname>${escapeXml(settings.host)}</hostname>\n      <port>${settings.port}</port>\n      <socketType>${settings.socketType}</socketType>\n      <authentication>password-cleartext</authentication>\n      <username>%EMAILADDRESS%</username>\n    </${name}>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<clientConfig version="1.1">\n  <emailProvider id="${config.domain}">\n    <domain>${config.domain}</domain>\n    <displayName>${config.displayName}</displayName>\n    <displayShortName>mooncci</displayShortName>\n${server('incomingServer', 'imap', config.imap)}\n${server('outgoingServer', 'smtp', config.smtp)}\n  </emailProvider>\n</clientConfig>\n`;
}
function plist(value) {
  if (typeof value === 'boolean') return value ? '<true/>' : '<false/>';
  if (typeof value === 'number' && Number.isInteger(value)) return `<integer>${value}</integer>`;
  if (typeof value === 'string') return `<string>${escapeXml(value)}</string>`;
  if (Array.isArray(value)) return `<array>${value.map(plist).join('\n')}</array>`;
  return `<dict>${Object.entries(value).map(([key, item]) => `<key>${escapeXml(key)}</key>${plist(item)}`).join('\n')}</dict>`;
}
function mobileconfig(value) {
  const email = validateEmail(value);
  if (!email) throw new Error('Unsupported email address');
  const outer = randomUUID(), inner = randomUUID();
  const payload = {
    PayloadType: 'com.apple.mail.managed', PayloadVersion: 1,
    PayloadIdentifier: `site.mooncci.mail.account.${inner}`, PayloadUUID: inner,
    PayloadDisplayName: config.displayName, EmailAccountDescription: config.displayName,
    EmailAccountType: 'EmailTypeIMAP', EmailAddress: email,
    IncomingMailServerHostName: config.imap.host, IncomingMailServerPortNumber: config.imap.port,
    IncomingMailServerUseSSL: true, IncomingMailServerAuthentication: 'EmailAuthPassword', IncomingMailServerUsername: email,
    OutgoingMailServerHostName: config.smtp.host, OutgoingMailServerPortNumber: config.smtp.port,
    // Apple's Mail payload exposes UseSSL + port, not a separate RequireSTARTTLS key.
    OutgoingMailServerUseSSL: true, OutgoingMailServerAuthentication: 'EmailAuthPassword', OutgoingMailServerUsername: email,
    OutgoingPasswordSameAsIncomingPassword: true,
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${plist({
    PayloadType: 'Configuration', PayloadVersion: 1, PayloadIdentifier: `site.mooncci.mail.${outer}`,
    PayloadUUID: outer, PayloadDisplayName: config.displayName,
    PayloadDescription: '未签名的 mooncci Mail 配置，仅供 Apple 自带邮件使用；请确认安装并在系统中填写自己的邮箱密码。',
    PayloadContent: [payload],
  })}</plist>\n`;
}
module.exports = { config, validateEmail, autoconfig, mobileconfig };
