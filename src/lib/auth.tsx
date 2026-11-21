import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { apiUrl } from '../config';
import type { AuthUser } from '../types';

interface AuthValue {
  user: AuthUser | null;
  loading: boolean;
  serverWaking: boolean;
  login: (email: string, password: string, totp?: string) => Promise<void>;
  signup: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverWaking, setServerWaking] = useState(false);

  const reload = useCallback(async () => {
    try {
      const response = await api.me();
      setUser(response.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number | null = null;
    let attempts = 0;
    let initialized = false;

    const check = async () => {
      let healthy = false;
      try {
        const response = await fetch(apiUrl('/api/health'), {
          cache: 'no-store',
          credentials: 'omit',
        });
        healthy = response.ok;
      } catch {
        healthy = false;
      }

      if (!active) return;
      setServerWaking(!healthy);
      if (healthy) {
        attempts = 0;
        if (!initialized) {
          initialized = true;
          try {
            const csrf = await api.authCsrf();
            if (!csrf.ok) throw new Error(`Backend returned ${csrf.status}`);
            const response = await api.me();
            if (active) setUser(response.user);
          } catch {
            if (active) setUser(null);
          } finally {
            if (active) setLoading(false);
          }
        }
      } else {
        attempts += 1;
      }

      const delay = healthy ? 30_000 : Math.min(1_000 * (2 ** attempts), 10_000);
      timer = window.setTimeout(() => void check(), delay);
    };

    void check();
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  const login = useCallback(async (email: string, password: string, totp?: string) => {
    const response = await api.login({ email, password, ...(totp ? { totp } : {}) });
    setUser(response.user);
  }, []);

  const signup = useCallback(async (email: string, username: string, password: string) => {
    await api.signup({ email, username, password });
    await api.login({ email, password });
    await reload();
  }, [reload]);

  const logout = useCallback(async () => {
    try { await api.logout(); } finally { setUser(null); }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, serverWaking, login, signup, logout, reload }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
