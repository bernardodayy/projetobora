import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, tokenStorage } from '../../lib/api';
import { resetSocket } from '../../lib/socket';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (slug: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('central.user');
    if (stored && tokenStorage.getAccess()) setUser(JSON.parse(stored));
    setLoading(false);
  }, []);

  // O usuário guardado no navegador é o do momento do login: se o cargo mudou (permissão dada ou tirada), o
  // menu ficava errado até sair e entrar de novo. Relê do servidor ao abrir, ao voltar para a aba e quando
  // uma chamada leva 403 — no máximo uma vez a cada 30 s.
  const lastRefresh = useRef(0);
  const loggedIn = !!user;
  useEffect(() => {
    if (!loggedIn) return;
    const refresh = async (force = false) => {
      if (!tokenStorage.getAccess() || (!force && Date.now() - lastRefresh.current < 30_000)) return;
      lastRefresh.current = Date.now();
      try {
        const { data } = await api.get<AuthUser>('/auth/me');
        setUser((current) => {
          if (!current || JSON.stringify(current) === JSON.stringify(data)) return current;
          localStorage.setItem('central.user', JSON.stringify(data));
          return data;
        });
      } catch {
        // sem rede agora: fica com o que tem; 401 já é tratado pelo interceptor (volta ao login)
      }
    };
    refresh(true);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('central:permissions-stale', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('central:permissions-stale', onFocus);
    };
  }, [loggedIn]);

  async function login(email: string, password: string) {
    const { data } = await api.post('/auth/login', { email, password });
    tokenStorage.set(data.accessToken, data.refreshToken);
    localStorage.setItem('central.user', JSON.stringify(data.user));
    setUser(data.user);
  }

  function logout() {
    const refreshToken = tokenStorage.getRefresh();
    if (refreshToken) api.post('/auth/logout', { refreshToken }).catch(() => {});
    tokenStorage.clear();
    localStorage.removeItem('central.user');
    resetSocket();
    setUser(null);
  }

  function hasPermission(slug: string) {
    return user?.permissions.includes(slug) ?? false;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
