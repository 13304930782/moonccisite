const AUTH_KEYS = ['token', 'user', 'auth', 'auth_user'];

export function clearAuthCache() {
  for (const key of AUTH_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Browser storage can be disabled. */
    }
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* Cookie authentication remains available. */
    }
  }
}
