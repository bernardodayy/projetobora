import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Address,
  BlockedDriver,
  CustomerProfile,
  CustomerSession,
  FarePreview,
  FavoriteDriver,
  PaymentMethod,
  Ride,
  RideHistoryEntry,
  RideMessage,
  SavedCard,
  SupportMessage,
  Wallet,
} from './types';

// ponytail: localhost funciona direto no simulador iOS e no target web; Android
// emulator e dispositivo físico precisam de EXPO_PUBLIC_API_URL apontando para
// o IP da máquina (ver .env.example).
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333/api';
const STORAGE_KEY = 'central-cliente.session';
const DISMISSED_RATINGS_KEY = 'central-cliente.dismissed-ratings';
// ponytail: só os últimos 20 — não é um registro de auditoria, só evita que
// "Agora não" mostre a mesma corrida de novo na próxima vez que abrir o app.
const DISMISSED_RATINGS_LIMIT = 20;

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let session: CustomerSession | null = null;
let onSessionChange: ((session: CustomerSession | null) => void) | null = null;

export function subscribeSession(listener: (session: CustomerSession | null) => void) {
  onSessionChange = listener;
}

async function persistSession(next: CustomerSession | null) {
  session = next;
  if (next) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  else await AsyncStorage.removeItem(STORAGE_KEY);
  onSessionChange?.(session);
}

export async function loadSession(): Promise<CustomerSession | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  session = raw ? JSON.parse(raw) : null;
  return session;
}

// Sem limite o fetch em IP errado/servidor fora do ar fica pendurado por mais de um minuto
// (spinner de boot/"Entrando…" sem fim) — assim vira um erro claro em segundos.
const REQUEST_TIMEOUT_MS = 15000;

async function request(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  let text: string;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });
    text = await res.text();
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique sua internet e tente de novo.');
  } finally {
    clearTimeout(timer);
  }
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // resposta que não é JSON (proxy/servidor caído devolvendo HTML): cai na mensagem genérica abaixo
  }
  if (!res.ok) throw new ApiError(res.status, (Array.isArray(body?.message) ? body.message.join(' · ') : body?.message) ?? `Erro ${res.status}`);
  return body;
}

// Refresh token é rotativo (invalida o antigo a cada uso) — sem esse cache,
// duas chamadas autenticadas em paralelo que expiram ao mesmo tempo
// disparariam dois refresh, o segundo usando um token já invalidado pelo
// primeiro e falhando à toa.
let refreshPromise: Promise<void> | null = null;

async function refreshSession() {
  if (!session) throw new ApiError(401, 'Sessão expirada');
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const tokens = await request('/customer-app/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: session!.refreshToken }),
      });
      await persistSession({ ...session!, ...tokens });
    })()
      .catch(async (err) => {
        // Refresh recusado (vencido, conta bloqueada/removida): a sessão morreu de verdade, volta pro login.
        // Erro de rede não derruba a sessão — só a próxima tentativa refaz.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          await persistSession(null);
          throw new ApiError(401, 'Sessão expirada, faça login novamente.');
        }
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function authRequest(path: string, options: RequestInit = {}, retried = false): Promise<any> {
  if (!session) throw new ApiError(401, 'Sessão expirada, faça login novamente.');
  try {
    return await request(path, {
      ...options,
      headers: { ...(options.headers ?? {}), Authorization: `Bearer ${session.accessToken}` },
    });
  } catch (err) {
    if (!retried && err instanceof ApiError && err.status === 401) {
      await refreshSession();
      return authRequest(path, options, true);
    }
    throw err;
  }
}

export async function login(cpf: string, password: string) {
  const data: CustomerSession = await request('/customer-app/auth/login', {
    method: 'POST',
    body: JSON.stringify({ cpf, password }),
  });
  await persistSession(data);
  return data;
}

export async function logout() {
  if (session) {
    await request('/customer-app/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    }).catch(() => undefined);
  }
  await persistSession(null);
}

export const customerApi = {
  me: (): Promise<CustomerProfile> => authRequest('/customer-app/me'),
  listAddresses: (): Promise<Address[]> => authRequest('/customer-app/addresses'),
  addAddress: (input: { label?: string; address: string; lat: number; lng: number }): Promise<Address> =>
    authRequest('/customer-app/addresses', { method: 'POST', body: JSON.stringify(input) }),
  updateAddress: (id: string, input: { label?: string; address?: string; lat?: number; lng?: number }): Promise<Address> =>
    authRequest(`/customer-app/addresses/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  removeAddress: (id: string) => authRequest(`/customer-app/addresses/${id}`, { method: 'DELETE' }),
  previewFare: (
    originLat: number,
    originLng: number,
    destinationLat: number,
    destinationLng: number,
    couponCode?: string,
  ): Promise<FarePreview | null> =>
    authRequest('/customer-app/fare-preview', {
      method: 'POST',
      body: JSON.stringify({ originLat, originLng, destinationLat, destinationLng, couponCode: couponCode || undefined }),
    }),
  currentRide: (): Promise<{ ride: Ride | null }> => authRequest('/customer-app/rides/current'),
  requestRide: (input: {
    originAddress: string;
    originLat: number;
    originLng: number;
    destinationAddress: string;
    destinationLat: number;
    destinationLng: number;
    paymentMethod?: PaymentMethod;
    couponCode?: string;
    scheduledAt?: string;
  }) => authRequest('/customer-app/rides', { method: 'POST', body: JSON.stringify(input) }),
  cancelRide: (rideId: string, reason: string) =>
    authRequest(`/customer-app/rides/${rideId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  rideMessages: (rideId: string): Promise<RideMessage[]> => authRequest(`/customer-app/rides/${rideId}/messages`),
  sendRideMessage: (rideId: string, message: string) =>
    authRequest(`/customer-app/rides/${rideId}/messages`, { method: 'POST', body: JSON.stringify({ message }) }),
  rateDriver: (rideId: string, rating: number) =>
    authRequest(`/customer-app/rides/${rideId}/rate-driver`, { method: 'POST', body: JSON.stringify({ rating }) }),
  rideHistory: (): Promise<RideHistoryEntry[]> => authRequest('/customer-app/rides'),
  changePassword: (currentPassword: string, newPassword: string) =>
    authRequest('/customer-app/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  sendSupportMessage: (message: string) =>
    authRequest('/customer-app/support-message', { method: 'POST', body: JSON.stringify({ message }) }),
  supportMessages: (): Promise<SupportMessage[]> => authRequest('/customer-app/support-messages'),
  listFavoriteDrivers: (): Promise<FavoriteDriver[]> => authRequest('/customer-app/favorites'),
  addFavoriteDriver: (driverId: string) => authRequest(`/customer-app/favorites/${driverId}`, { method: 'POST' }),
  removeFavoriteDriver: (driverId: string) => authRequest(`/customer-app/favorites/${driverId}`, { method: 'DELETE' }),
  listBlockedDrivers: (): Promise<BlockedDriver[]> => authRequest('/customer-app/blocked-drivers'),
  blockDriver: (driverId: string) => authRequest(`/customer-app/blocked-drivers/${driverId}`, { method: 'POST' }),
  unblockDriver: (driverId: string) => authRequest(`/customer-app/blocked-drivers/${driverId}`, { method: 'DELETE' }),
  getWallet: (): Promise<Wallet> => authRequest('/customer-app/wallet'),
  topUpWallet: (amount: number): Promise<Wallet> =>
    authRequest('/customer-app/wallet/topup', { method: 'POST', body: JSON.stringify({ amount }) }),
  listCards: (): Promise<SavedCard[]> => authRequest('/customer-app/cards'),
  addCard: (input: { brand: string; last4: string; expiry: string }): Promise<SavedCard> =>
    authRequest('/customer-app/cards', { method: 'POST', body: JSON.stringify(input) }),
  removeCard: (id: string) => authRequest(`/customer-app/cards/${id}`, { method: 'DELETE' }),
};

export function getAccessToken() {
  return session?.accessToken ?? null;
}

// "Agora não" na avaliação não marca nada no servidor (o cliente pode voltar e
// avaliar depois) — só evita que a mesma corrida concluída fique bloqueando a
// tela inicial a cada vez que o app reabre.
export async function dismissRating(rideId: string) {
  const raw = await AsyncStorage.getItem(DISMISSED_RATINGS_KEY);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  const next = [rideId, ...ids.filter((id) => id !== rideId)].slice(0, DISMISSED_RATINGS_LIMIT);
  await AsyncStorage.setItem(DISMISSED_RATINGS_KEY, JSON.stringify(next));
}

export async function isRatingDismissed(rideId: string) {
  const raw = await AsyncStorage.getItem(DISMISSED_RATINGS_KEY);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  return ids.includes(rideId);
}
