import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 8;

// ponytail: contador em memória, por processo — segura força bruta numa
// instância só. Com várias instâncias da API, mover pra Redis (REDIS_URL já
// está previsto no .env) ou @nestjs/throttler com storage compartilhado.
// Atrás de proxy/load balancer, ligar `trust proxy` no Express pra req.ip ser o do cliente.
const failures = new Map<string, { count: number; resetAt: number }>();

// Só falha de credencial conta: login certo zera o contador, então usuário
// legítimo não é punido e um atacante fica limitado por (IP + identificador).
export async function throttledLogin<T>(key: string, attempt: () => Promise<T>): Promise<T> {
  const now = Date.now();
  if (failures.size > 10_000) for (const [k, v] of failures) if (v.resetAt < now) failures.delete(k);

  const entry = failures.get(key);
  if (entry && entry.resetAt > now && entry.count >= MAX_FAILURES) {
    throw new HttpException('Muitas tentativas de login. Aguarde alguns minutos e tente de novo.', HttpStatus.TOO_MANY_REQUESTS);
  }

  try {
    const result = await attempt();
    failures.delete(key);
    return result;
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + WINDOW_MS };
      current.count += 1;
      failures.set(key, current);
    }
    throw error;
  }
}
