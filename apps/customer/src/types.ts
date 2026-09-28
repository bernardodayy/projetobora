export type RideStatus =
  | 'REQUESTED'
  | 'SEARCHING_DRIVER'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_EN_ROUTE'
  | 'PASSENGER_ABOARD'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface RideDriver {
  id: string;
  name: string;
  // só vem depois que o motorista aceita a corrida (antes é só uma oferta)
  phone?: string;
  // chave Pix para pagar o motorista: só vem depois do aceite e só numa corrida paga no Pix
  pixKey?: string | null;
  rating: string | null;
  lastLat: string | null;
  lastLng: string | null;
  vehicles: { plate: string; model: string; brand: string }[];
}

export interface Ride {
  id: string;
  status: RideStatus;
  cancelReason?: string | null;
  originAddress: string;
  originLat: string;
  originLng: string;
  destinationAddress: string;
  distanceKm: string | null;
  finalPrice: string | null;
  paymentMethod?: PaymentMethod | null;
  driverRating: number | null;
  driver: RideDriver | null;
}

export interface Address {
  id: string;
  label: string | null;
  address: string;
  lat: string;
  lng: string;
}

export interface RideHistoryEntry {
  id: string;
  status: RideStatus;
  originAddress: string;
  destinationAddress: string;
  finalPrice: string | null;
  requestedAt: string;
  scheduledAt: string | null;
  driver: { name: string } | null;
}

export interface CustomerProfile {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  email: string | null;
}

export interface FarePreview {
  finalPrice: number;
  distanceKm: number;
  durationMin: number;
  couponCode?: string;
  discount?: number;
}

export interface CustomerSession {
  accessToken: string;
  refreshToken: string;
  customer: { id: string; name: string; cpf: string };
}

export type PaymentMethod = 'CASH' | 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'WALLET';

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  WALLET: 'Carteira',
};

export interface FavoriteDriver {
  id: string;
  driverId: string;
  createdAt: string;
  driver: { id: string; name: string; phone: string; rating: string | null; vehicles: { plate: string; model: string; brand: string }[] };
}

export interface BlockedDriver {
  id: string;
  driverId: string;
  createdAt: string;
  driver: { id: string; name: string; phone: string; rating: string | null; vehicles: { plate: string; model: string; brand: string }[] };
}

export type WalletTransactionType = 'TOPUP' | 'RIDE_PAYMENT' | 'REFUND';

export interface WalletTransaction {
  id: string;
  type: WalletTransactionType;
  amount: string;
  description: string;
  createdAt: string;
}

export interface Wallet {
  balance: number;
  transactions: WalletTransaction[];
}

export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expiry: string;
  createdAt: string;
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
