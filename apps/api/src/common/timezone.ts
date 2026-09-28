import { BadRequestException } from '@nestjs/common';

// O servidor costuma rodar em UTC, mas tarifas por horário ("18:00–20:00"), dias da
// semana e o faturamento por dia são do horário de quem opera (Brasília, sem horário
// de verão desde 2019). Antes tudo usava o relógio da máquina: em produção em UTC o
// horário de pico valia 3h adiantado e corridas da noite caíam no "dia seguinte".
// Outro fuso: APP_TZ_OFFSET="-04:00" no .env.
function offset(): string {
  const value = process.env.APP_TZ_OFFSET ?? '-03:00';
  return /^[+-]\d{2}:\d{2}$/.test(value) ? value : '-03:00';
}

function offsetMinutes(): number {
  const o = offset();
  return (o[0] === '-' ? -1 : 1) * (Number(o.slice(1, 3)) * 60 + Number(o.slice(4, 6)));
}

export function localParts(at: Date) {
  const shifted = new Date(at.getTime() + offsetMinutes() * 60_000);
  return { day: shifted.getUTCDay(), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(), date: shifted.toISOString().slice(0, 10) };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Filtro de período vindo de <input type="date"> ("2026-09-26") vale o dia inteiro
// no fuso local; antes o "até" virava meia-noite UTC e deixava o último dia de fora.
export function rangeBound(value: string | undefined, edge: 'start' | 'end'): Date | undefined {
  if (!value) return undefined;
  const date = DATE_ONLY.test(value) ? new Date(`${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}${offset()}`) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Data inválida');
  return date;
}
