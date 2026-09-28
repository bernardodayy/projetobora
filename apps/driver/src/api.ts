import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlockedCustomer, DriverSession, DriverSummary, RideHistoryEntry, RideMessage, ScheduledRide, SupportMessage } from './types';

// ponytail: localhost funciona direto no simulador iOS e no target web; Android
// emulator e dispositivo físico precisam de EXPO_PUBLIC_API_URL apontando para
// o IP da máquina (ver .env.example).
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333/api';
const STORAGE_KEY = 'central-motorista.session';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let session: DriverSession | null = null;
let onSessionChange: ((session: DriverSession | null) => void) | null = null;

export function subscribeSession(listener: (session: DriverSession | null) => void) {
  onSessionChange = listener;
}

async function persistSession(next: DriverSession | null) {
  session = next;
  if (next) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  else await AsyncStorage.removeItem(STORAGE_KEY);
  onSessionChange?.(session);
}

export async function loadSession(): Promise<DriverSession | null> {
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
// duas chamadas autenticadas em paralelo que expiram ao mesmo tempo (ex.:
// Ganhos + Atividade buscando dados juntas) disparariam dois refresh, o
// segundo usando um token já invalidado pelo primeiro e falhando à toa.
let refreshPromise: Promise<void> | null = null;

async function refreshSession() {
  if (!session) throw new ApiError(401, 'Sessão expirada');
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const tokens = await request('/driver-app/auth/refresh', {
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
  const data: DriverSession = await request('/driver-app/auth/login', {
    method: 'POST',
    body: JSON.stringify({ cpf, password }),
  });
  await persistSession(data);
  return data;
}

export async function logout() {
  if (session) {
    await request('/driver-app/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    }).catch(() => undefined);
  }
  await persistSession(null);
}

export const driverApi = {
  me: () => authRequest('/driver-app/me'),
  setAvailability: (availability: 'AVAILABLE' | 'OFFLINE') =>
    authRequest('/driver-app/availability', { method: 'PATCH', body: JSON.stringify({ availability }) }),
  updatePayment: (input: { pixKey?: string; hasCardMachine?: boolean }) =>
    authRequest('/driver-app/payment', { method: 'PATCH', body: JSON.stringify(input) }),
  heartbeat: (): Promise<{ availability: string }> => authRequest('/driver-app/heartbeat', { method: 'POST' }),
  updateLocation: (lat: number, lng: number) =>
    authRequest('/driver-app/location', { method: 'PATCH', body: JSON.stringify({ lat, lng }) }),
  currentRide: (): Promise<{ ride: import('./types').Ride | null }> => authRequest('/driver-app/rides/current'),
  rideHistory: (): Promise<RideHistoryEntry[]> => authRequest('/driver-app/rides'),
  scheduledRides: (): Promise<ScheduledRide[]> => authRequest('/driver-app/rides/scheduled'),
  summary: (): Promise<DriverSummary> => authRequest('/driver-app/summary'),
  accept: (rideId: string) => authRequest(`/driver-app/rides/${rideId}/accept`, { method: 'POST' }),
  decline: (rideId: string, reason?: string) =>
    authRequest(`/driver-app/rides/${rideId}/decline`, { method: 'POST', body: JSON.stringify({ reason }) }),
  passengerAboard: (rideId: string) => authRequest(`/driver-app/rides/${rideId}/passenger-aboard`, { method: 'POST' }),
  start: (rideId: string) => authRequest(`/driver-app/rides/${rideId}/start`, { method: 'POST' }),
  complete: (rideId: string) => authRequest(`/driver-app/rides/${rideId}/complete`, { method: 'POST' }),
  rateCustomer: (rideId: string, rating: number) =>
    authRequest(`/driver-app/rides/${rideId}/rate-customer`, { method: 'POST', body: JSON.stringify({ rating }) }),
  sendNote: (rideId: string, message: string) =>
    authRequest(`/driver-app/rides/${rideId}/note`, { method: 'POST', body: JSON.stringify({ message }) }),
  rideMessages: (rideId: string): Promise<RideMessage[]> => authRequest(`/driver-app/rides/${rideId}/messages`),
  sendRideMessage: (rideId: string, message: string) =>
    authRequest(`/driver-app/rides/${rideId}/messages`, { method: 'POST', body: JSON.stringify({ message }) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    authRequest('/driver-app/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  sendSupportMessage: (message: string) =>
    authRequest('/driver-app/support-message', { method: 'POST', body: JSON.stringify({ message }) }),
  supportMessages: (): Promise<SupportMessage[]> => authRequest('/driver-app/support-messages'),
  listBlockedCustomers: (): Promise<BlockedCustomer[]> => authRequest('/driver-app/blocked-customers'),
  blockCustomer: (customerId: string) => authRequest(`/driver-app/blocked-customers/${customerId}`, { method: 'POST' }),
  unblockCustomer: (customerId: string) => authRequest(`/driver-app/blocked-customers/${customerId}`, { method: 'DELETE' }),
};

export function getAccessToken() {
  return session?.accessToken ?? null;
}
