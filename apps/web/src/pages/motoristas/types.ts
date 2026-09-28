export interface VehicleRow {
  id: string;
  plate: string;
  model: string;
  brand: string;
  year: number | null;
  color: string | null;
}

export interface DriverBlockRow {
  id: string;
  reason: string;
  blockedAt: string;
  unblockedAt: string | null;
  blockedBy: { id: string; name: string } | null;
}

export type DriverStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'BLOCKED' | 'SUSPENDED';
export type DriverAvailability = 'OFFLINE' | 'AVAILABLE' | 'BUSY' | 'EN_ROUTE' | 'WAITING_PASSENGER';

export interface DriverRow {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  cnh: string;
  cnhCategory: string;
  status: DriverStatus;
  availability: DriverAvailability;
  rating: string | null;
  lastLat: string | null;
  lastLng: string | null;
  lastLocationAt: string | null;
  pixKey: string | null;
  hasCardMachine: boolean;
  createdAt: string;
  vehicles: VehicleRow[];
}

export interface DriverDetail extends DriverRow {
  blocks: DriverBlockRow[];
}

export const STATUS_LABEL: Record<DriverStatus, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Reprovado',
  BLOCKED: 'Bloqueado',
  SUSPENDED: 'Suspenso',
};

export const STATUS_TONE: Record<DriverStatus, 'success' | 'danger' | 'warning' | 'neutral'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  BLOCKED: 'danger',
  SUSPENDED: 'warning',
};

export const AVAILABILITY_LABEL: Record<DriverAvailability, string> = {
  OFFLINE: 'Offline',
  AVAILABLE: 'Disponível',
  BUSY: 'Em corrida',
  EN_ROUTE: 'A caminho',
  WAITING_PASSENGER: 'Aguardando passageiro',
};

export function formatCpf(cpf: string) {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}
