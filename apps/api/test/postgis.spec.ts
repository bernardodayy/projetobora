import { nearestDriverPostgis, zonesContainingPoint } from '../src/common/postgis';

function valuesOf(call: unknown[]) {
  // Prisma.sql produz um objeto com .values (parâmetros na ordem em que aparecem na query montada).
  return (call[0] as { values: unknown[] }).values;
}

describe('nearestDriverPostgis', () => {
  const origin = { lat: -23.55, lng: -46.63 };
  const baseOptions = { excludeDriverIds: [], maxKm: 30, preferredKm: 5 };

  it('returns the single nearest match the query gives back', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ id: 'driver-1', distanceKm: 2.4 }]) } as any;
    await expect(nearestDriverPostgis(prisma, origin, baseOptions)).resolves.toEqual({ id: 'driver-1', distanceKm: 2.4 });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns null without querying when onlyDriverIds is explicitly empty (same shortcut as the JS version)', async () => {
    const prisma = { $queryRaw: jest.fn() } as any;
    await expect(nearestDriverPostgis(prisma, origin, { ...baseOptions, onlyDriverIds: [] })).resolves.toBeNull();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns null when nobody matches', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) } as any;
    await expect(nearestDriverPostgis(prisma, origin, baseOptions)).resolves.toBeNull();
  });

  it('carries the origin, the max radius in meters and the exclude list into the query parameters', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) } as any;
    await nearestDriverPostgis(prisma, origin, { ...baseOptions, maxKm: 30, excludeDriverIds: ['a', 'b'] });
    const values = valuesOf(prisma.$queryRaw.mock.calls[0]);
    expect(values).toEqual(expect.arrayContaining([origin.lng, origin.lat, 30_000, 'a', 'b']));
  });

  it('only considers drivers with a sign of life inside the presence window', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) } as any;
    await nearestDriverPostgis(prisma, origin, baseOptions);
    const sql = prisma.$queryRaw.mock.calls[0][0].sql;
    expect(sql).toContain('"lastSeenAt" >=');
    const values = valuesOf(prisma.$queryRaw.mock.calls[0]);
    const cutoff = values.find((v: unknown) => v instanceof Date) as Date | undefined;
    expect(cutoff).toBeInstanceOf(Date);
    expect(Date.now() - cutoff!.getTime()).toBeLessThan(3 * 60_000 + 5_000); // PRESENCE_TIMEOUT_MS (common/presence.ts) + folga
  });

  it('only restricts by card machine on a card ride, and only by Pix key on a Pix ride', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) } as any;
    for (const method of ['CREDIT_CARD', 'DEBIT_CARD']) {
      await nearestDriverPostgis(prisma, origin, { ...baseOptions, paymentMethod: method });
      expect(prisma.$queryRaw.mock.calls.at(-1)![0].sql).toContain('"hasCardMachine" = true');
    }
    await nearestDriverPostgis(prisma, origin, { ...baseOptions, paymentMethod: 'PIX' });
    expect(prisma.$queryRaw.mock.calls.at(-1)![0].sql).toContain('"pixKey" IS NOT NULL');
    await nearestDriverPostgis(prisma, origin, { ...baseOptions, paymentMethod: 'CASH' });
    const cashSql = prisma.$queryRaw.mock.calls.at(-1)![0].sql;
    expect(cashSql).not.toContain('hasCardMachine');
    expect(cashSql).not.toContain('pixKey');
  });
});

describe('zonesContainingPoint', () => {
  it('returns [] without querying when there are no candidate zones', async () => {
    const prisma = { $queryRaw: jest.fn() } as any;
    await expect(zonesContainingPoint(prisma, [], { lat: 0, lng: 0 })).resolves.toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns the ids the query reports as containing the point', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ id: 'zone-1' }, { id: 'zone-2' }]) } as any;
    await expect(zonesContainingPoint(prisma, ['zone-1', 'zone-2', 'zone-3'], { lat: -23.5, lng: -46.6 })).resolves.toEqual(['zone-1', 'zone-2']);
    const values = valuesOf(prisma.$queryRaw.mock.calls[0]);
    expect(values).toEqual(expect.arrayContaining(['zone-1', 'zone-2', 'zone-3', -46.6, -23.5]));
  });
});
