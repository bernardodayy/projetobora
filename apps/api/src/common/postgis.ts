import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { presenceCutoff } from './presence';
import type { LatLng } from '../pricing/geometry.util';

// Consultas espaciais prontas, usando a coluna `geom` (PostGIS, ver migration enable_postgis) que o banco
// já mantém em sincronia sozinho com lastLat/lastLng e com geometry/shape — nenhuma escrita da aplicação
// muda. Servem de substituto, quando o volume justificar, para o casamento em memória que
// RidesService.findNearestAvailableDriver e PricingEngineService.findApplicableZone fazem hoje (ver
// ARQUITETURA.md 5-K para o porquê de ainda não estarem ligadas no despacho/precificação de verdade).

export interface NearestDriverMatch {
  id: string;
  distanceKm: number;
}

interface NearestDriverOptions {
  excludeDriverIds: string[];
  onlyDriverIds?: string[];
  maxKm: number;
  preferredKm: number;
  paymentMethod?: string | null;
}

// Mesma regra de apps/api/src/common/payment.ts (driverReceivesFilter), reescrita em SQL porque essa
// função monta a query bruta — duplicação pequena e deliberada; se a regra de pagamento mudar, ajustar
// aqui também (não há um jeito de reaproveitar um Prisma.WhereInput dentro de um $queryRaw).
const CARD_METHODS = ['CREDIT_CARD', 'DEBIT_CARD'];

// Equivalente a RidesService.findNearestAvailableDriver — mesmos critérios (aprovado, disponível, sinal de
// vida recente, capaz de receber a forma de pagamento da corrida, prefere quem está no raio preferencial e
// só cai pro raio máximo se não houver ninguém dentro dele) — mas numa única consulta indexada (GiST) em
// vez de trazer todo mundo pra memória e calcular haversine em JS.
export async function nearestDriverPostgis(
  prisma: PrismaService,
  origin: LatLng,
  options: NearestDriverOptions,
): Promise<NearestDriverMatch | null> {
  const { excludeDriverIds, onlyDriverIds, maxKm, preferredKm, paymentMethod } = options;
  if (onlyDriverIds && onlyDriverIds.length === 0) return null;

  const originGeom = Prisma.sql`ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography`;

  const conditions = [
    Prisma.sql`status = 'APPROVED'`,
    Prisma.sql`availability = 'AVAILABLE'`,
    Prisma.sql`"deletedAt" IS NULL`,
    Prisma.sql`geom IS NOT NULL`,
    Prisma.sql`"lastSeenAt" >= ${presenceCutoff()}`,
    Prisma.sql`ST_DWithin(geom, ${originGeom}, ${maxKm * 1000})`,
  ];
  if (paymentMethod && CARD_METHODS.includes(paymentMethod)) conditions.push(Prisma.sql`"hasCardMachine" = true`);
  else if (paymentMethod === 'PIX') conditions.push(Prisma.sql`"pixKey" IS NOT NULL`);
  if (excludeDriverIds.length) conditions.push(Prisma.sql`id NOT IN (${Prisma.join(excludeDriverIds)})`);
  if (onlyDriverIds) conditions.push(Prisma.sql`id IN (${Prisma.join(onlyDriverIds)})`);

  const where = Prisma.join(conditions, ' AND ');
  const rows = await prisma.$queryRaw<NearestDriverMatch[]>(Prisma.sql`
    SELECT id, ST_Distance(geom, ${originGeom}) / 1000 AS "distanceKm"
    FROM "Driver"
    WHERE ${where}
    ORDER BY ST_DWithin(geom, ${originGeom}, ${preferredKm * 1000}) DESC, geom <-> ${originGeom}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

// Equivalente ao isPointInPolygon/isPointInCircle que PricingEngineService.findApplicableZone roda em JS,
// usando ST_Contains sobre a geometria já convertida (círculo virou polígono via buffer). Recebe só os ids
// já filtrados por data/dia da semana/horário — isso não é espacial, continua em JS.
export async function zonesContainingPoint(prisma: PrismaService, zoneIds: string[], point: LatLng): Promise<string[]> {
  if (zoneIds.length === 0) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM "PricingZone"
    WHERE id IN (${Prisma.join(zoneIds)})
      AND geom IS NOT NULL
      AND ST_Contains(geom, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326))
  `);
  return rows.map((r) => r.id);
}
