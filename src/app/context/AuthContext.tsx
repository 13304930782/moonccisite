import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
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
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const data = await api('/auth/me');
      setUser(data.user);
      return data.user;
    } catch {
      clearAuthCache();
      setUser(null);
      return null;
    }
  };

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    clearAuthCache();

    setUser(data.user);

    return data.user;
  };

  const register = async (username: string, email: string, password: string) => {
    await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // Local auth state must still be cleared even if the network request fails.
    } finally {
      clearAuthCache();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
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
