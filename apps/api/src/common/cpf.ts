import { registerDecorator, ValidationOptions } from 'class-validator';

// CPF de verdade: 11 dígitos, não todos iguais (111.111.111-11 passa na conta mas não existe) e os dois
// dígitos verificadores batendo. Antes qualquer sequência de 11 números era aceita no cadastro.
export function isValidCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]);
}

// Só nos cadastros (admin criando cliente/motorista). O login de propósito NÃO usa: contas de teste
// antigas têm CPF que não passa na conta e ficariam trancadas para fora.
export function IsCpf(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isCpf',
      target: object.constructor,
      propertyName,
      options: { message: 'CPF inválido', ...options },
      validator: { validate: (value: unknown) => typeof value === 'string' && isValidCpf(value) },
    });
}
