// O passageiro paga direto ao motorista, fora do app (mesma regra de apps/api/src/common/payment.ts):
// corrida no cartão só com máquina no carro; no Pix, só com chave cadastrada.
type Receiver = { pixKey?: string | null; hasCardMachine?: boolean };

// Aviso (não bloqueio) quando o operador escolhe à mão um motorista que não recebe a forma de pagamento da corrida.
export function paymentWarning(method: string | null | undefined, driver: Receiver): string | null {
  if ((method === 'CREDIT_CARD' || method === 'DEBIT_CARD') && !driver.hasCardMachine) return 'sem máquina de cartão';
  if (method === 'PIX' && !driver.pixKey?.trim()) return 'sem chave Pix';
  return null;
}

export function receivesLabel(driver: Receiver): string {
  const parts = ['Dinheiro'];
  if (driver.pixKey?.trim()) parts.push('Pix');
  if (driver.hasCardMachine) parts.push('Cartão');
  return parts.join(' · ');
}
