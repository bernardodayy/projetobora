export type RideStatus =
  | 'REQUESTED'
  | 'SEARCHING_DRIVER'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_EN_ROUTE'
  | 'PASSENGER_ABOARD'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type PaymentMethod = 'CASH' | 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'WALLET';

export interface Ride {
  id: string;
  status: RideStatus;
  originAddress: string;
  originLat: string;
  originLng: string;
  destinationAddress: string;
  destinationLat: string;
  destinationLng: string;
  distanceKm: string | null;
  finalPrice: string | null;
  paymentMethod?: PaymentMethod | null;
  customerRating: number | null;
  // Só na oferta do despacho automático: quando ela vence e passa para outro motorista.
  offerExpiresAt?: string | null;
  // phone só vem depois de aceitar a corrida (antes é só uma oferta)
  customer: { id: string; name: string; phone?: string };
}

export interface DriverSession {
  accessToken: string;
  refreshToken: string;
  driver: { id: string; name: string; cpf: string; availability: 'AVAILABLE' | 'OFFLINE' | 'BUSY' | 'EN_ROUTE' | 'WAITING_PASSENGER' };
}

export interface DriverProfile {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  rating: string | null;
  pixKey?: string | null;
  hasCardMachine?: boolean;
  vehicles: { plate: string; model: string; brand: string }[];
}

export interface RideHistoryEntry {
  id: string;
  status: RideStatus;
  originAddress: string;
  destinationAddress: string;
  finalPrice: string | null;
  requestedAt: string;
  customer: { name: string } | null;
}

// Resumo do próprio motorista (corridas concluídas): quanto rodou hoje e no mês.
export interface DriverSummary {
  today: { rides: number; total: number };
  month: { rides: number; total: number };
}

export interface SupportMessage {
  id: string;
  message: string;
  reply: string | null;
  createdAt: string;
}

export interface RideMessage {
  id: string;
  senderType: 'customer' | 'driver';
  message: string;
  createdAt: string;
}

export interface BlockedCustomer {
  id: string;
  customerId: string;
  createdAt: string;
  customer: { id: string; name: string; phone: string; rating: string | null };
}

export interface ScheduledRide {
  id: string;
  status: RideStatus;
  originAddress: string;
  destinationAddress: string;
  finalPrice: string | null;
  scheduledAt: string;
  customer: { id: string; name: string; phone: string };
}
