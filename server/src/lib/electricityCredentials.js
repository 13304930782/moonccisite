const crypto = require('crypto');
function key() {
  const value = String(process.env.ELECTRICITY_CREDENTIAL_KEY || '');
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw Object.assign(new Error('请先配置服务端电量凭据加密密钥'), {
      code: 'ELECTRICITY_KEY_UNAVAILABLE',
    });
  return Buffer.from(value, 'hex');
}
function encrypt(value, roomId) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(`mooncci-room:${roomId}`));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}
function decrypt(value, roomId) {
  const raw = Buffer.from(value, 'base64'),
    cipher = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
  cipher.setAAD(Buffer.from(`mooncci-room:${roomId}`));
  cipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([cipher.update(raw.subarray(28)), cipher.final()]).toString(
      'utf8',
    ),
  );
}
module.exports = { encrypt, decrypt };
