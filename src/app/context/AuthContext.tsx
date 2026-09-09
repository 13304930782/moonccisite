import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { clearAuthCache } from '../lib/authToken';

type User = {
  id: number;
  username: string;
  email: string;
  role: 'owner' | 'admin' | 'editor' | 'user';
  status?: string;
  can_comment?: number;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  googleLogin: (credential: string) => Promise<User>;
  register: (
    username: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<boolean>;
  loggingOut: boolean;
  logoutError: string;
  refreshUser: () => Promise<User | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const authVersion = useRef(0);
  const logoutRequest = useRef<Promise<boolean> | null>(null);
  const loginRequest = useRef<Promise<User> | null>(null);

  const refreshUser = async () => {
    if (logoutRequest.current) return null;
    const version = authVersion.current;
    try {
      const data = await api('/auth/me', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (version !== authVersion.current) return null;
      setUser(data.user);
      return data.user;
    } catch (error) {
      if (version !== authVersion.current) return null;
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        clearAuthCache();
        setUser(null);
      }
      return null;
    }
  };

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
    const onLogout = (event: StorageEvent) => {
      if (event.key !== 'mooncci:logout' || !event.newValue) return;
      authVersion.current += 1;
      clearAuthCache();
      setUser(null);
      setLogoutError('');
    };
    window.addEventListener('storage', onLogout);
    return () => window.removeEventListener('storage', onLogout);
  }, []);

  const authenticate = (path: string, body: object): Promise<User> => {
    if (logoutRequest.current) throw new Error('正在退出登录，请稍后重试。');
    if (loginRequest.current) throw new Error('正在登录，请稍后重试。');
    const version = ++authVersion.current;
    const request = (async () => {
      try {
        const data = await api(path, {
          method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
        });
        if (data.registration_required) {
          if (version === authVersion.current) window.location.assign('/complete-registration');
          throw new Error('请完成邮箱验证后继续。');
        }
        if (version === authVersion.current) {
          clearAuthCache();
          setLogoutError('');
          setUser(data.user);
        }
        return data.user;
      } finally { loginRequest.current = null; }
    })();
    loginRequest.current = request;
    return request;
  };
  const login = (email: string, password: string) => authenticate('/auth/login', { email, password });

  const register = async (
    username: string,
    email: string,
    password: string,
  ) => {
    await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
  };

  const googleLogin = (credential: string) => authenticate('/auth/google', { credential });

  const logout = (): Promise<boolean> => {
    if (logoutRequest.current) return logoutRequest.current;
    authVersion.current += 1;
    setLoggingOut(true);
    setLogoutError('');
    const request = (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        // Let a pending sign-in install its cookie before the server clears/revokes it.
        if (loginRequest.current) await loginRequest.current.catch(() => {});
        // The HttpOnly cookie must be cleared by the server before showing logout success.
        await api('/auth/logout', {
          method: 'POST',
          cache: 'no-store',
          signal: controller.signal,
        });
        authVersion.current += 1;
        clearAuthCache();
        setUser(null);
        try {
          localStorage.setItem(
            'mooncci:logout',
            `${Date.now()}:${Math.random()}`,
          );
        } catch {
          /* Storage may be disabled; cookie logout still succeeds. */
        }
        return true;
      } catch {
        setLogoutError('退出登录未完成，请检查网络后重试。');
        return false;
      } finally {
        window.clearTimeout(timeout);
        logoutRequest.current = null;
        setLoggingOut(false);
      }
    })();
    logoutRequest.current = request;
    return request;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        googleLogin,
        register,
        logout,
        loggingOut,
        logoutError,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return value;
}
