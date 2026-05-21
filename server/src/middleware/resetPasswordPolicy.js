const PASSWORD_RULE_MESSAGE = '密码至少 8 位，并且需要同时包含字母和数字。';

function validatePassword(password) {
  if (password.length < 8) return PASSWORD_RULE_MESSAGE;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return PASSWORD_RULE_MESSAGE;
  return '';
}

function resetPasswordPolicy(req, res, next) {
  if (req.method !== 'POST') {
    return next();
  }

  const password = String(req.body?.password || '');
  const passwordError = validatePassword(password);

  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  next();
}

module.exports = resetPasswordPolicy;
