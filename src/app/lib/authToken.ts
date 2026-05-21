const AUTH_KEYS = ['token', 'user', 'auth', 'auth_user'];

export function clearAuthCache() {
  for (const key of AUTH_KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}
