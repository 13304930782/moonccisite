/**
 * Mirrors the server's password rule (server/src/routes/auth-cookie.js):
 * 8+ characters, letters and digits, at most 72 UTF-8 bytes (bcrypt limit).
 * The server stays the source of truth; this only gives early, specific feedback.
 */
export type PasswordCheck = { id: 'length' | 'letter' | 'digit' | 'bytes'; label: string; ok: boolean };

export function passwordChecks(password: string): PasswordCheck[] {
  const bytes = new TextEncoder().encode(password).length;
  return [
    { id: 'length', label: '至少 8 位', ok: password.length >= 8 },
    { id: 'letter', label: '包含字母', ok: /[A-Za-z]/.test(password) },
    { id: 'digit', label: '包含数字', ok: /\d/.test(password) },
    { id: 'bytes', label: '不超过 72 字节', ok: bytes <= 72 },
  ];
}

export function passwordProblem(password: string): string {
  const failed = passwordChecks(password).find(check => !check.ok);
  if (!failed) return '';
  return failed.id === 'bytes' ? '密码不能超过 72 字节（约 24 个汉字）。' : '密码至少 8 位，并且需要同时包含字母和数字。';
}
