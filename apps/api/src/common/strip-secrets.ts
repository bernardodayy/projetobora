// Nunca deixa hash de senha sair da API (resposta HTTP, evento de socket ou
// linha de auditoria) — os services devolvem a linha inteira do Prisma, então
// filtrar aqui, num lugar só, cobre todas as rotas de uma vez.
export function stripSecrets<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value, (key, v) => (key === 'passwordHash' ? undefined : v)));
}
