import { Prisma } from '@prisma/client';

// O passageiro paga direto ao motorista, fora do app: dinheiro, Pix na chave do motorista ou cartão na
// máquina dele. Então nem todo motorista pode receber qualquer forma de pagamento.
const CARD_METHODS = ['CREDIT_CARD', 'DEBIT_CARD'];

export type PaymentReceiver = { pixKey?: string | null; hasCardMachine?: boolean };

// Corrida no cartão só vai a quem tem máquina; no Pix, só a quem cadastrou a chave. Dinheiro (e a carteira
// virtual, que não passa pelo motorista) não restringe ninguém.
export function driverCanReceive(method: string | null | undefined, driver: PaymentReceiver): boolean {
  if (method && CARD_METHODS.includes(method)) return !!driver.hasCardMachine;
  if (method === 'PIX') return !!driver.pixKey?.trim();
  return true;
}

// Mesma regra como filtro de consulta (despacho automático).
export function driverReceivesFilter(method: string | null | undefined): Prisma.DriverWhereInput {
  if (method && CARD_METHODS.includes(method)) return { hasCardMachine: true };
  if (method === 'PIX') return { pixKey: { not: null } };
  return {};
}
