import { createHash } from 'crypto';

export function parseDurationMs(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration);
  if (!match) throw new Error(`Duração inválida: ${duration}`);
  const value = Number(match[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]]!;
  return value * unit;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
