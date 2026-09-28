export interface FinancialSummary {
  revenue: number;
  platformFees: number;
  payoutsPending: number;
  payoutsPaid: number;
  cancelledRides: number;
}

export interface DailyRevenuePoint {
  date: string;
  amount: number;
}

export type TransactionType = 'RIDE_PAYMENT' | 'DRIVER_PAYOUT' | 'PLATFORM_FEE' | 'REFUND';
export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export const TYPE_LABEL: Record<TransactionType, string> = {
  RIDE_PAYMENT: 'Pagamento de corrida',
  DRIVER_PAYOUT: 'Repasse ao motorista',
  PLATFORM_FEE: 'Taxa da plataforma',
  REFUND: 'Reembolso',
};

export const STATUS_LABEL: Record<TransactionStatus, string> = {
  PENDING: 'Pendente',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
};

export interface FinancialTransactionRow {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: string;
  createdAt: string;
  ride: {
    id: string;
    customer: { id: string; name: string };
    driver: { id: string; name: string } | null;
    paymentMethod: string | null;
  } | null;
}
