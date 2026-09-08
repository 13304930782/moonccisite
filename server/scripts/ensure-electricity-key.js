const fs = require('fs'),
  path = require('path'),
  crypto = require('crypto');
const envFile = path.resolve(__dirname, '../.env');
let source = fs.readFileSync(envFile, 'utf8');
const parsed = require('dotenv').parse(source);
if (parsed.ELECTRICITY_CREDENTIAL_KEY) {
  if (!/^[a-f0-9]{64}$/i.test(parsed.ELECTRICITY_CREDENTIAL_KEY))
    throw new Error('ELECTRICITY_CREDENTIAL_KEY_INVALID');
  console.log('电量凭据加密密钥已存在，保持原值。');
} else {
  const value = crypto.randomBytes(32).toString('hex');
  source = source.replace(/^\s*ELECTRICITY_CREDENTIAL_KEY\s*=.*$/gm, '');
  fs.writeFileSync(
    envFile,
    source.trimEnd() + '\nELECTRICITY_CREDENTIAL_KEY=' + value + '\n',
    { mode: 0o600 },
  );
  console.log('电量凭据加密密钥已保存至服务端 .env。');
}
