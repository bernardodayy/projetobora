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

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  WALLET: 'Carteira',
};

export interface RideRow {
  id: string;
  status: RideStatus;
  paymentMethod: PaymentMethod | null;
  couponCode: string | null;
  discountApplied: string | null;
  originAddress: string;
  destinationAddress: string;
  requestedAt: string;
  scheduledAt: string | null;
  finalPrice: string | null;
  customer: { id: string; name: string };
  driver: { id: string; name: string } | null;
}

export interface RideEventRow {
  id: string;
  status: RideStatus;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface RideDetail extends RideRow {
  originLat: string;
  originLng: string;
  destinationLat: string;
  destinationLng: string;
  cancelReason: string | null;
  events: RideEventRow[];
}

export interface RideMessageRow {
  id: string;
  senderType: 'customer' | 'driver';
  message: string;
  createdAt: string;
}

export const STATUS_LABEL: Record<RideStatus, string> = {
  REQUESTED: 'Solicitada',
  SEARCHING_DRIVER: 'Procurando motorista',
  DRIVER_ASSIGNED: 'Motorista encontrado',
  DRIVER_EN_ROUTE: 'Motorista a caminho',
  PASSENGER_ABOARD: 'Passageiro embarcado',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

export const STATUS_TONE: Record<RideStatus, 'neutral' | 'success' | 'danger' | 'warning' | 'brand'> = {
  REQUESTED: 'neutral',
  SEARCHING_DRIVER: 'warning',
  DRIVER_ASSIGNED: 'brand',
  DRIVER_EN_ROUTE: 'brand',
  PASSENGER_ABOARD: 'brand',
  IN_PROGRESS: 'brand',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

// Espelha ALLOWED_TRANSITIONS do backend (rides.service.ts) para orientar a UI;
// o backend é sempre a fonte de verdade e valida de novo no servidor.
export const NEXT_STATUS: Partial<Record<RideStatus, RideStatus>> = {
  REQUESTED: 'SEARCHING_DRIVER',
  DRIVER_ASSIGNED: 'DRIVER_EN_ROUTE',
  DRIVER_EN_ROUTE: 'PASSENGER_ABOARD',
  PASSENGER_ABOARD: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
};

export const CANCELLABLE_STATUSES: RideStatus[] = [
  'REQUESTED',
  'SEARCHING_DRIVER',
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'PASSENGER_ABOARD',
  'IN_PROGRESS',
];
