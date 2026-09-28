import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RidesService } from '../src/rides/rides.service';
import { nearestDriverPostgis } from '../src/common/postgis';

// O casamento espacial (motorista mais próximo) mora em common/postgis.ts (ver postgis.spec.ts para os
// critérios de elegibilidade em si — sinal de vida, forma de pagamento etc.); aqui só interessa que
// RidesService chama essa busca com as opções certas (raio, exclusões, forma de pagamento) e usa o
// resultado corretamente — não como o SQL é montado.
jest.mock('../src/common/postgis');
const mockNearestDriver = nearestDriverPostgis as jest.Mock;

function makeService(ride: any, driver: any = { status: 'APPROVED' }) {
  const prisma = {
    ride: {
      findUnique: jest.fn().mockResolvedValue(ride),
      update: jest.fn().mockResolvedValue(ride),
    },
    driver: {
      findFirst: jest.fn().mockResolvedValue(driver),
    },
    rideEvent: {
      create: jest.fn(),
    },
  } as any;
  const audit = { log: jest.fn() } as any;
  const realtime = { broadcastRideUpdated: jest.fn(), broadcastDriverUpdated: jest.fn(), notifyDriver: jest.fn(), notifyCustomer: jest.fn() } as any;
  const pricingEngine = { calculate: jest.fn().mockResolvedValue(null) } as any;
  const financeiro = { generateTransactionsForRide: jest.fn() } as any;
  const notifications = { create: jest.fn() } as any;
  const settings = { getSection: jest.fn().mockResolvedValue({ tempoOfertaSegundos: 15, tempoEsperaMinutos: 2, distanciaMaximaKm: 30, tentativasDespacho: 3, raioProcuraKm: 5 }) } as any;
  const coupons = { validate: jest.fn(), redeem: jest.fn(), release: jest.fn() } as any;
  return new RidesService(prisma, audit, realtime, pricingEngine, financeiro, notifications, settings, coupons);
}

function makeDispatchService(ride: any) {
  const prisma: any = {
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
    ride: {
      findUnique: jest.fn().mockResolvedValue(ride),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(ride),
      create: jest.fn().mockResolvedValue(ride),
    },
    driver: {
      findFirst: jest.fn().mockResolvedValue({ status: 'APPROVED' }),
      update: jest.fn().mockImplementation(({ where, data }: any) => ({ id: where.id, ...data })),
    },
    customer: {
      findFirst: jest.fn().mockResolvedValue({ status: 'ACTIVE', walletBalance: 0 }),
    },
    customerBlockedDriver: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    driverBlockedCustomer: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    customerFavoriteDriver: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    rideEvent: {
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as any;
  const audit = { log: jest.fn() } as any;
  const realtime = { broadcastRideUpdated: jest.fn(), broadcastDriverUpdated: jest.fn(), notifyDriver: jest.fn(), notifyCustomer: jest.fn() } as any;
  const pricingEngine = { calculate: jest.fn().mockResolvedValue(null) } as any;
  const financeiro = { generateTransactionsForRide: jest.fn() } as any;
  const notifications = { create: jest.fn() } as any;
  const settings = { getSection: jest.fn().mockResolvedValue({ tempoOfertaSegundos: 15, tempoEsperaMinutos: 2, distanciaMaximaKm: 30, tentativasDespacho: 3, raioProcuraKm: 5 }) } as any;
  const coupons = { validate: jest.fn(), redeem: jest.fn(), release: jest.fn() } as any;
  const service = new RidesService(prisma, audit, realtime, pricingEngine, financeiro, notifications, settings, coupons);
  return { service, prisma, pricingEngine, coupons, notifications };
}

function makeMessageService(ride: any) {
  const prisma = {
    ride: { findUnique: jest.fn().mockResolvedValue(ride) },
    rideMessage: { create: jest.fn().mockImplementation(({ data }: any) => data), findMany: jest.fn() },
  } as any;
  const realtime = { notifyDriver: jest.fn(), notifyCustomer: jest.fn() } as any;
  const service = new RidesService(prisma, {} as any, realtime, {} as any, {} as any, {} as any, {} as any, {} as any);
  return { service, prisma, realtime };
}

function makeCancelService(ride: any) {
  const prisma = {
    ride: { findUnique: jest.fn().mockResolvedValue(ride), update: jest.fn().mockResolvedValue({ ...ride, status: 'CANCELLED' }) },
    rideEvent: { create: jest.fn() },
    driver: { update: jest.fn().mockResolvedValue({}) },
  } as any;
  const audit = { log: jest.fn() } as any;
  const realtime = { broadcastRideUpdated: jest.fn(), broadcastDriverUpdated: jest.fn(), notifyDriver: jest.fn(), notifyCustomer: jest.fn() } as any;
  const notifications = { create: jest.fn() } as any;
  const coupons = { release: jest.fn() } as any;
  const service = new RidesService(prisma, audit, realtime, {} as any, {} as any, notifications, {} as any, coupons);
  return { service, prisma, audit, coupons };
}

const baseRide = { id: 'ride-1', status: 'DRIVER_ASSIGNED', customer: { name: 'Cliente Teste' }, originAddress: 'A', destinationAddress: 'B' };

describe('RidesService status transitions', () => {
  it('advances a ride to the next allowed status', async () => {
    const service = makeService(baseRide);
    await expect(service.advanceStatus('ride-1', { status: 'DRIVER_EN_ROUTE' }, 'admin-1')).resolves.toBeDefined();
  });

  it('rejects an advance that skips steps', async () => {
    const service = makeService(baseRide);
    await expect(service.advanceStatus('ride-1', { status: 'COMPLETED' }, 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('explains in Portuguese when the ride was already cancelled instead of leaking the enum', async () => {
    const service = makeService({ ...baseRide, status: 'CANCELLED' });
    await expect(service.advanceStatus('ride-1', { status: 'COMPLETED' }, 'admin-1')).rejects.toThrow('Esta corrida foi cancelada e não pode mais ser alterada.');
  });

  it('rejects assigning a driver once a ride is already underway', async () => {
    const service = makeService({ ...baseRide, status: 'IN_PROGRESS' });
    await expect(service.assignDriver('ride-1', { driverId: 'driver-1' }, 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects assigning a driver that is not approved', async () => {
    const service = makeService({ ...baseRide, status: 'REQUESTED' }, { status: 'BLOCKED' });
    await expect(service.assignDriver('ride-1', { driverId: 'driver-1' }, 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects cancelling a completed ride', async () => {
    const service = makeService({ ...baseRide, status: 'COMPLETED' });
    await expect(service.cancel('ride-1', { reason: 'cliente desistiu' }, 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('allows cancelling a ride still in progress', async () => {
    const service = makeService({ ...baseRide, status: 'IN_PROGRESS' });
    await expect(service.cancel('ride-1', { reason: 'cliente desistiu' }, 'admin-1')).resolves.toBeDefined();
  });
});

describe('RidesService automatic dispatch', () => {
  beforeEach(() => {
    mockNearestDriver.mockReset().mockResolvedValue(null); // sem motorista, por padrão — cada teste liga o que precisa
  });

  it('auto-assigns the nearest available driver on ride creation', async () => {
    const created = { id: 'ride-1', status: 'REQUESTED' };
    const { service, prisma } = makeDispatchService(created);
    mockNearestDriver.mockResolvedValue({ id: 'near', distanceKm: 1.1 });

    const dto = {
      customerId: 'c1',
      originAddress: 'Origem 12345',
      originLat: 0,
      originLng: 0,
      destinationAddress: 'Destino 12345',
      destinationLat: 0,
      destinationLng: 0,
    } as any;
    await service.create(dto, 'admin-1');

    const busyUpdate = prisma.driver.update.mock.calls.find((call: any) => call[0].data.availability === 'BUSY');
    expect(busyUpdate[0].where.id).toBe('near');
  });

  it('offers the ride to an available favorite driver before the nearest one', async () => {
    const created = { id: 'ride-1', status: 'REQUESTED' };
    const { service, prisma } = makeDispatchService(created);
    mockNearestDriver.mockResolvedValueOnce({ id: 'favorite-far', distanceKm: 11 }); // 1ª chamada: só entre os favoritos
    prisma.customerFavoriteDriver.findMany.mockResolvedValue([{ driverId: 'favorite-far' }]);

    const dto = {
      customerId: 'c1',
      originAddress: 'Origem 12345',
      originLat: 0,
      originLng: 0,
      destinationAddress: 'Destino 12345',
      destinationLat: 0,
      destinationLng: 0,
    } as any;
    await service.create(dto, 'admin-1');

    expect(mockNearestDriver).toHaveBeenCalledTimes(1); // achou favorito, nem chegou a buscar geral
    expect(mockNearestDriver.mock.calls[0][2].onlyDriverIds).toEqual(['favorite-far']);
    const busyUpdate = prisma.driver.update.mock.calls.find((call: any) => call[0].data.availability === 'BUSY');
    expect(busyUpdate[0].where.id).toBe('favorite-far');
  });

  it('gives an automatic offer a deadline (tempoOfertaSegundos) so it can expire', async () => {
    const { service, prisma } = makeDispatchService({ id: 'ride-1', status: 'REQUESTED' });
    mockNearestDriver.mockResolvedValue({ id: 'near', distanceKm: 1.1 });

    await service.create({ customerId: 'c1', originAddress: 'Origem 12345', originLat: 0, originLng: 0, destinationAddress: 'Destino 12345', destinationLat: 0, destinationLng: 0 } as any, 'admin-1');

    const offer = prisma.ride.update.mock.calls.find((call: any) => call[0].data.status === 'DRIVER_ASSIGNED')[0].data.offerExpiresAt;
    expect(offer).toBeInstanceOf(Date);
    expect(offer.getTime() - Date.now()).toBeGreaterThan(13_000);
    expect(offer.getTime() - Date.now()).toBeLessThanOrEqual(15_000);
  });

  it('does not put a deadline on a driver the operator assigned by hand', async () => {
    const { service, prisma } = makeDispatchService({ ...baseRide, status: 'REQUESTED' });
    await service.assignDriver('ride-1', { driverId: 'driver-1' }, 'admin-1');
    expect(prisma.ride.update.mock.calls[0][0].data.offerExpiresAt).toBeNull();
  });

  it('passes an expired offer to the next driver, marked as a timeout', async () => {
    const { service, prisma } = makeDispatchService({ id: 'ride-1', status: 'DRIVER_ASSIGNED', driverId: 'driver-A', originLat: 0, originLng: 0, originAddress: 'A', destinationAddress: 'B' });
    prisma.ride.findMany = jest.fn().mockResolvedValue([{ id: 'ride-1' }]);

    await service.expireStaleOffers();

    const query = prisma.ride.findMany.mock.calls[0][0].where;
    expect(query).toEqual({ status: 'DRIVER_ASSIGNED', offerExpiresAt: { lte: expect.any(Date) } });
    expect(prisma.rideEvent.create).toHaveBeenCalledWith({
      data: { rideId: 'ride-1', status: 'DRIVER_ASSIGNED', metadata: { driverId: 'driver-A', declined: true, reason: 'Sem resposta no tempo limite', timedOut: true } },
    });
    expect(prisma.ride.update).toHaveBeenCalledWith(expect.objectContaining({ data: { driverId: null, status: 'SEARCHING_DRIVER', offerExpiresAt: null } }));
  });

  it('ignores an expired offer the driver answered just in time', async () => {
    const { service, prisma } = makeDispatchService({ id: 'ride-1', status: 'DRIVER_EN_ROUTE', driverId: 'driver-A' });
    prisma.ride.findMany = jest.fn().mockResolvedValue([{ id: 'ride-1' }]);

    await expect(service.expireStaleOffers()).resolves.toBeUndefined();
    expect(prisma.ride.update).not.toHaveBeenCalled();
  });

  describe('search queue (retry + timeout)', () => {
    const searching = (over: any = {}) => ({ id: 'ride-1', customerId: 'c1', status: 'SEARCHING_DRIVER', driverId: null, originLat: 0, originLng: 0, originAddress: 'A', destinationAddress: 'B', customer: { name: 'Maria' }, requestedAt: new Date(), scheduledAt: null, ...over });
    const setup = (ride: any) => {
      const made = makeDispatchService(ride);
      made.prisma.ride.findMany = jest.fn().mockResolvedValue([ride]);
      return made;
    };

    it('retries a ride with no driver and assigns one that came online meanwhile', async () => {
      const { service, prisma } = setup(searching());
      mockNearestDriver.mockResolvedValue({ id: 'late', distanceKm: 2 });

      await service.processSearchingRides();

      const assigned = prisma.ride.update.mock.calls.find((call: any) => call[0].data.status === 'DRIVER_ASSIGNED')[0];
      expect(assigned.where).toEqual({ id: 'ride-1', status: 'SEARCHING_DRIVER' });
      expect(assigned.data.driverId).toBe('late');
      expect(assigned.data.offerExpiresAt).toBeInstanceOf(Date);
    });

    it('only looks at rides already due (a scheduled ride waits for its time)', async () => {
      const { service, prisma } = setup(searching());
      await service.processSearchingRides();
      expect(prisma.ride.findMany.mock.calls[0][0].where).toEqual({
        status: 'SEARCHING_DRIVER',
        driverId: null,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: expect.any(Date) } }],
      });
    });

    it('does not offer more drivers once the attempt limit is reached', async () => {
      const { service, prisma } = setup(searching());
      prisma.rideEvent.findMany.mockResolvedValue([{ metadata: { driverId: 'a' } }, { metadata: { driverId: 'b' } }, { metadata: { driverId: 'c' } }]);
      await service.processSearchingRides();
      expect(mockNearestDriver).not.toHaveBeenCalled();
    });

    it('cancels the ride when nobody accepted within the maximum search time and frees its coupon', async () => {
      const { service, prisma, coupons } = setup(searching({ requestedAt: new Date(Date.now() - 3 * 60_000) }));
      await service.processSearchingRides();

      const cancelled = prisma.ride.update.mock.calls.find((call: any) => call[0].data.status === 'CANCELLED')[0];
      expect(cancelled.data.cancelReason).toContain('Nenhum motorista disponível');
      expect(coupons.release).toHaveBeenCalledWith('ride-1');
      expect(mockNearestDriver).not.toHaveBeenCalled();
    });

    it('counts the search time from the scheduled time, not from when it was requested', async () => {
      const { service, prisma } = setup(searching({ requestedAt: new Date(Date.now() - 3 * 3600_000), scheduledAt: new Date(Date.now() - 30_000) }));
      await service.processSearchingRides();
      expect(prisma.ride.update.mock.calls.some((call: any) => call[0].data.status === 'CANCELLED')).toBe(false);
    });

    it('keeps going when one ride in the queue fails', async () => {
      const { service, prisma } = setup(searching());
      prisma.rideEvent.findMany.mockRejectedValue(new Error('boom'));
      await expect(service.processSearchingRides()).resolves.toBeUndefined();
    });
  });

  it('gives the driver back when the ride was cancelled while the driver was being picked', async () => {
    const { service, prisma } = makeDispatchService({ id: 'ride-1', status: 'REQUESTED' });
    mockNearestDriver.mockResolvedValue({ id: 'near', distanceKm: 1.1 });
    prisma.ride.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('changed', { code: 'P2025', clientVersion: 't' }));

    await expect((service as any).tryAutoAssign('ride-1', 'c1', { lat: 0, lng: 0 })).rejects.toThrow(ConflictException);

    expect(prisma.driver.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'near' }, data: { availability: 'AVAILABLE' } }));
  });

  it('excludes previously tried drivers when redispatching', async () => {
    const before = { id: 'ride-1', status: 'DRIVER_ASSIGNED', driverId: 'driver-A', originLat: 0, originLng: 0 };
    const { service, prisma } = makeDispatchService(before);
    prisma.rideEvent.findMany.mockResolvedValue([{ metadata: { driverId: 'driver-A' } }]);

    await service.redispatch('ride-1', 'admin-1');

    expect(mockNearestDriver.mock.calls[0][2].excludeDriverIds).toContain('driver-A');
  });

  // Os critérios de elegibilidade (sinal de vida, forma de pagamento → SQL) são de common/postgis.ts —
  // ver postgis.spec.ts. Aqui só interessa que RidesService passa a forma de pagamento certa adiante.
  it.each(['CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'CASH'])('passes the ride\'s payment method through to the driver search (%s)', async (paymentMethod) => {
    const { service } = makeDispatchService({ id: 'ride-1', status: 'REQUESTED' });
    await service.create({ customerId: 'c1', originAddress: 'Origem 12345', originLat: 0, originLng: 0, destinationAddress: 'Destino 12345', destinationLat: 0, destinationLng: 0, paymentMethod } as any, 'admin-1');
    expect(mockNearestDriver.mock.calls[0][2].paymentMethod).toBe(paymentMethod);
  });

  it('keeps the payment requirement when the ride is redispatched or retried later', async () => {
    const before = { id: 'ride-1', status: 'DRIVER_ASSIGNED', driverId: 'driver-A', customerId: 'c1', originLat: 0, originLng: 0, originAddress: 'A', destinationAddress: 'B', paymentMethod: 'CREDIT_CARD' };
    const { service, prisma } = makeDispatchService(before);
    await service.redispatch('ride-1', 'admin-1');
    expect(mockNearestDriver.mock.calls[0][2].paymentMethod).toBe('CREDIT_CARD');
  });

  it('excludes drivers the customer has blocked from auto-assignment', async () => {
    const created = { id: 'ride-1', status: 'REQUESTED' };
    const { service, prisma } = makeDispatchService(created);
    prisma.customerBlockedDriver.findMany.mockResolvedValue([{ driverId: 'driver-blocked' }]);

    const dto = {
      customerId: 'c1',
      originAddress: 'Origem 12345',
      originLat: 0,
      originLng: 0,
      destinationAddress: 'Destino 12345',
      destinationLat: 0,
      destinationLng: 0,
    } as any;
    await service.create(dto, 'admin-1');

    expect(mockNearestDriver.mock.calls[0][2].excludeDriverIds).toContain('driver-blocked');
  });

  it('excludes drivers who have blocked the customer from auto-assignment', async () => {
    const created = { id: 'ride-1', status: 'REQUESTED' };
    const { service, prisma } = makeDispatchService(created);
    prisma.driverBlockedCustomer.findMany.mockResolvedValue([{ driverId: 'driver-who-blocked-me' }]);

    const dto = {
      customerId: 'c1',
      originAddress: 'Origem 12345',
      originLat: 0,
      originLng: 0,
      destinationAddress: 'Destino 12345',
      destinationLat: 0,
      destinationLng: 0,
    } as any;
    await service.create(dto, 'admin-1');

    expect(mockNearestDriver.mock.calls[0][2].excludeDriverIds).toContain('driver-who-blocked-me');
  });

  it('sends the ride back to the queue (no error) once the attempt limit is reached, so the driver can still decline', async () => {
    const before = { id: 'ride-1', status: 'DRIVER_ASSIGNED', driverId: 'driver-A', originLat: 0, originLng: 0, originAddress: 'A', destinationAddress: 'B' };
    const { service, prisma, notifications } = makeDispatchService(before);
    prisma.rideEvent.findMany.mockResolvedValue([{ metadata: { driverId: 'a' } }, { metadata: { driverId: 'b' } }, { metadata: { driverId: 'driver-A' } }]);

    await expect(service.redispatch('ride-1', 'admin-1')).resolves.toBeDefined();

    expect(mockNearestDriver).not.toHaveBeenCalled(); // não procurou outro motorista
    expect(prisma.ride.update).toHaveBeenCalledWith(expect.objectContaining({ data: { driverId: null, status: 'SEARCHING_DRIVER', offerExpiresAt: null } }));
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Despacho automático não encontrou motorista' }));
  });

  it('does not count a decline annotation as an extra dispatch attempt', async () => {
    const before = { id: 'ride-1', status: 'DRIVER_ASSIGNED', driverId: 'driver-B', originLat: 0, originLng: 0, originAddress: 'A', destinationAddress: 'B' };
    const { service, prisma } = makeDispatchService(before);
    // 2 ofertas reais + 1 anotação de recusa = 2 tentativas (limite é 3): ainda deve buscar outro motorista
    prisma.rideEvent.findMany.mockResolvedValue([
      { metadata: { driverId: 'driver-A', auto: true } },
      { metadata: { driverId: 'driver-A', declined: true, reason: 'longe' } },
      { metadata: { driverId: 'driver-B', auto: true } },
    ]);

    await service.redispatch('ride-1', undefined, 'longe demais');

    expect(mockNearestDriver).toHaveBeenCalled();
  });

  it('turns a concurrent status change into a conflict instead of applying it twice', async () => {
    const service = makeService(baseRide);
    const prismaOf = (service as any).prisma;
    prismaOf.ride.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('not found', { code: 'P2025', clientVersion: 'x' }));

    await expect(service.advanceStatus('ride-1', { status: 'DRIVER_EN_ROUTE' }, 'admin-1')).rejects.toThrow(ConflictException);
    expect(prismaOf.rideEvent.create).not.toHaveBeenCalled();
  });

  it('skips a driver another ride claimed first and offers the next nearest one', async () => {
    const created = { id: 'ride-1', status: 'REQUESTED' };
    const { service, prisma } = makeDispatchService(created);
    const pool = [
      { id: 'near', distanceKm: 1 },
      { id: 'far', distanceKm: 2 },
    ];
    mockNearestDriver.mockImplementation(async (_prisma: any, _origin: any, options: any) => pool.find((d) => !options.excludeDriverIds.includes(d.id)) ?? null);
    prisma.driver.update.mockImplementation(({ where, data }: any) => {
      if (where.id === 'near') throw new Prisma.PrismaClientKnownRequestError('taken', { code: 'P2025', clientVersion: 'x' });
      return { id: where.id, ...data };
    });

    await service.create({ customerId: 'c1', originAddress: 'Origem 12345', originLat: 0, originLng: 0, destinationAddress: 'Destino 12345', destinationLat: 0, destinationLng: 0 } as any, 'admin-1');

    const assigned = prisma.ride.update.mock.calls.find((call: any) => call[0].data.status === 'DRIVER_ASSIGNED');
    expect(assigned[0].data.driverId).toBe('far');
    expect(mockNearestDriver).toHaveBeenCalledTimes(2); // 1ª achou 'near' (levado por outra corrida), 2ª achou 'far'
  });

  it('rejects a second immediate ride for a customer who already has one active', async () => {
    const { service, prisma } = makeDispatchService({ id: 'ride-1', status: 'REQUESTED' });
    prisma.ride.findFirst.mockResolvedValue({ id: 'ride-antiga' });

    await expect(
      service.create({ customerId: 'c1', originAddress: 'Origem 12345', originLat: 0, originLng: 0, destinationAddress: 'Destino 12345', destinationLat: 0, destinationLng: 0 } as any, 'admin-1'),
    ).rejects.toThrow('já tem uma corrida em andamento');
    expect(prisma.ride.create).not.toHaveBeenCalled();
  });

  it('rejects a ride for a blocked customer', async () => {
    const { service, prisma } = makeDispatchService({ id: 'ride-1', status: 'REQUESTED' });
    prisma.customer.findFirst.mockResolvedValue({ status: 'BLOCKED', walletBalance: 0 });

    await expect(
      service.create({ customerId: 'c1', originAddress: 'Origem 12345', originLat: 0, originLng: 0, destinationAddress: 'Destino 12345', destinationLat: 0, destinationLng: 0 } as any, 'admin-1'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.ride.create).not.toHaveBeenCalled();
  });

  it('redeems the coupon inside the same transaction that creates the ride', async () => {
    const { service, prisma, pricingEngine, coupons } = makeDispatchService({ id: 'ride-1', status: 'REQUESTED' });
    pricingEngine.calculate.mockResolvedValue({ finalPrice: 30 });
    coupons.validate.mockResolvedValue({ finalPrice: 25, discount: 5 });

    await service.create({ customerId: 'c1', originAddress: 'Origem 12345', originLat: 0, originLng: 0, destinationAddress: 'Destino 12345', destinationLat: 0, destinationLng: 0, couponCode: 'promo' } as any, 'admin-1');

    expect(coupons.redeem).toHaveBeenCalledWith('promo', 'c1', 'ride-1', prisma);
  });

  it('gives the coupon use back when a ride is cancelled', async () => {
    const { service, coupons } = makeCancelService({ id: 'ride-1', status: 'REQUESTED', customerId: 'c1', driverId: null, customer: { name: 'Maria' }, originAddress: 'A', destinationAddress: 'B' });
    await service.cancel('ride-1', { reason: 'mudei de ideia' }, 'admin-1');
    expect(coupons.release).toHaveBeenCalledWith('ride-1');
  });

  it('records the decline reason as an event when the driver provides one', async () => {
    const before = { id: 'ride-1', status: 'DRIVER_ASSIGNED', driverId: 'driver-A', originLat: 0, originLng: 0 };
    const { service, prisma } = makeDispatchService(before);

    await service.redispatch('ride-1', undefined, 'Trânsito muito parado');

    expect(prisma.rideEvent.create).toHaveBeenCalledWith({
      data: { rideId: 'ride-1', status: 'DRIVER_ASSIGNED', metadata: { driverId: 'driver-A', declined: true, reason: 'Trânsito muito parado' } },
    });
  });

  it('rejects a wallet ride when the customer balance is insufficient', async () => {
    const created = { id: 'ride-1', status: 'REQUESTED' };
    const { service, prisma, pricingEngine } = makeDispatchService(created);
    pricingEngine.calculate.mockResolvedValue({ finalPrice: 25 });
    prisma.customer.findFirst.mockResolvedValue({ status: 'ACTIVE', walletBalance: 0 });

    const dto = {
      customerId: 'c1',
      originAddress: 'Origem 12345',
      originLat: 0,
      originLng: 0,
      destinationAddress: 'Destino 12345',
      destinationLat: 0,
      destinationLng: 0,
      paymentMethod: 'WALLET',
    } as any;

    await expect(service.create(dto, 'admin-1')).rejects.toThrow(BadRequestException);
    expect(mockNearestDriver).not.toHaveBeenCalled();
  });

  it('does not auto-dispatch a ride scheduled far in the future', async () => {
    const created = { id: 'ride-1', status: 'REQUESTED' };
    const { service, prisma } = makeDispatchService(created);

    const dto = {
      customerId: 'c1',
      originAddress: 'Origem 12345',
      originLat: 0,
      originLng: 0,
      destinationAddress: 'Destino 12345',
      destinationLat: 0,
      destinationLng: 0,
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    } as any;

    await service.create(dto, 'admin-1');

    expect(mockNearestDriver).not.toHaveBeenCalled();
  });
});

describe('RidesService quote (Central form preview)', () => {
  const base = { originLat: 0, originLng: 0, destinationLat: 0.01, destinationLng: 0.01 };

  it('returns the price and the coupon discount without creating anything', async () => {
    const { service, prisma, pricingEngine, coupons } = makeDispatchService({ id: 'x' });
    pricingEngine.calculate.mockResolvedValue({ finalPrice: 30, distanceKm: 3, durationMin: 9 });
    coupons.validate.mockResolvedValue({ code: 'PROMO', discount: 5, finalPrice: 25 });

    const result = await service.quote({ ...base, customerId: 'c1', couponCode: ' promo ' });

    expect(result).toEqual({ pricing: { distanceKm: 3, durationMin: 9, price: 30 }, discount: 5, finalPrice: 25, couponCode: 'PROMO', couponError: null });
    expect(coupons.validate).toHaveBeenCalledWith('promo', 30, 'c1');
    expect(prisma.ride.create).not.toHaveBeenCalled();
  });

  it('reports a bad coupon as a message, not an error, so the operator can fix it before saving', async () => {
    const { service, pricingEngine, coupons } = makeDispatchService({ id: 'x' });
    pricingEngine.calculate.mockResolvedValue({ finalPrice: 30, distanceKm: 3, durationMin: 9 });
    coupons.validate.mockRejectedValue(new BadRequestException('Cupom esgotado'));

    const result = await service.quote({ ...base, couponCode: 'ACABOU' });

    expect(result.couponError).toBe('Cupom esgotado');
    expect(result.finalPrice).toBe(30);
    expect(result.discount).toBe(0);
  });

  it('has no estimate when no tariff is configured (the ride would be created with the price pending)', async () => {
    const { service, pricingEngine } = makeDispatchService({ id: 'x' });
    pricingEngine.calculate.mockRejectedValue(new Error('sem tarifa'));
    await expect(service.quote({ ...base, couponCode: 'X' })).resolves.toEqual({ pricing: null, discount: 0, finalPrice: null, couponCode: null, couponError: null });
  });

  it('does not swallow unexpected coupon errors', async () => {
    const { service, pricingEngine, coupons } = makeDispatchService({ id: 'x' });
    pricingEngine.calculate.mockResolvedValue({ finalPrice: 30, distanceKm: 3, durationMin: 9 });
    coupons.validate.mockRejectedValue(new Error('banco caiu'));
    await expect(service.quote({ ...base, couponCode: 'X' })).rejects.toThrow('banco caiu');
  });
});

describe('RidesService ride messages', () => {
  it('rejects sending a message before a driver is assigned', async () => {
    const { service } = makeMessageService({ id: 'ride-1', status: 'SEARCHING_DRIVER', customerId: 'c1', driverId: null });
    await expect(service.sendMessage('ride-1', 'customer', 'Oi, tudo bem?')).rejects.toThrow(BadRequestException);
  });

  it('persists a driver message and notifies the customer', async () => {
    const { service, prisma, realtime } = makeMessageService({ id: 'ride-1', status: 'DRIVER_ASSIGNED', customerId: 'c1', driverId: 'd1' });
    await service.sendMessage('ride-1', 'driver', 'Já estou chegando');

    expect(prisma.rideMessage.create).toHaveBeenCalledWith({ data: { rideId: 'ride-1', senderType: 'driver', message: 'Já estou chegando' } });
    expect(realtime.notifyCustomer).toHaveBeenCalledWith('c1', 'ride-message.created');
  });

  it('persists a customer message and notifies the driver', async () => {
    const { service, prisma, realtime } = makeMessageService({ id: 'ride-1', status: 'IN_PROGRESS', customerId: 'c1', driverId: 'd1' });
    await service.sendMessage('ride-1', 'customer', 'Estou no portão azul');

    expect(prisma.rideMessage.create).toHaveBeenCalledWith({ data: { rideId: 'ride-1', senderType: 'customer', message: 'Estou no portão azul' } });
    expect(realtime.notifyDriver).toHaveBeenCalledWith('d1', 'ride-message.created');
  });
});

describe('RidesService blockedDriverIdsForRide', () => {
  it('combines drivers the customer blocked with drivers who blocked the customer', async () => {
    const { service, prisma } = makeMessageService({ id: 'ride-1', customerId: 'c1' });
    prisma.customerBlockedDriver = { findMany: jest.fn().mockResolvedValue([{ driverId: 'd1' }]) };
    prisma.driverBlockedCustomer = { findMany: jest.fn().mockResolvedValue([{ driverId: 'd2' }]) };

    const result = await service.blockedDriverIdsForRide('ride-1');

    expect(result.sort()).toEqual(['d1', 'd2']);
    expect(prisma.customerBlockedDriver.findMany).toHaveBeenCalledWith({ where: { customerId: 'c1' }, select: { driverId: true } });
  });
});

describe('RidesService audit attribution', () => {
  const cancellableRide = { id: 'ride-1', status: 'REQUESTED', customerId: 'c1', driverId: null, customer: { name: 'Maria Souza' }, originAddress: 'A', destinationAddress: 'B' };

  it('attributes a self-service cancellation to the acting customer, not an admin FK', async () => {
    const { service, audit } = makeCancelService(cancellableRide);
    await service.cancel('ride-1', { reason: 'mudei de ideia' }, { type: 'customer', id: 'c1', label: 'Maria Souza' });

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actorType: 'customer', actorLabel: 'Maria Souza', action: 'CANCEL' }));
    expect(audit.log.mock.calls[0][0]).not.toHaveProperty('actorId');
  });

  it('keeps attributing admin actions by actorId as before', async () => {
    const { service, audit } = makeCancelService(cancellableRide);
    await service.cancel('ride-1', { reason: 'solicitado por telefone' }, 'admin-1');

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'admin-1', action: 'CANCEL' }));
  });
});
