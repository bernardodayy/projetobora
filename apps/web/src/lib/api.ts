import axios from 'axios';

const baseURL = `${import.meta.env.VITE_API_URL ?? 'http://localhost:3333'}/api`;

export const api = axios.create({ baseURL });

// ponytail: tokens em localStorage (exposto a XSS). Mover refresh token para cookie
// httpOnly quando web e api compartilharem domínio/proxy em produção.
const ACCESS_KEY = 'central.accessToken';
const REFRESH_KEY = 'central.refreshToken';

export const tokenStorage = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: (accessToken: string, refreshToken: string) => {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

api.interceptors.request.use((config) => {
  const token = tokenStorage.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokenStorage.getRefresh();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
    tokenStorage.set(data.accessToken, data.refreshToken);
    return data.accessToken;
  } catch {
    tokenStorage.clear();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    // 403 = o menu pode estar desatualizado (cargo mudou): pede pro AuthProvider reler as permissões.
    if (error.response?.status === 403) window.dispatchEvent(new Event('central:permissions-stale'));
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      refreshing ??= refreshAccessToken().finally(() => {
        refreshing = null;
      });
      const newToken = await refreshing;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      // Já na tela de login (senha errada também dá 401) não recarrega: apagaria a mensagem de erro.
      if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);
