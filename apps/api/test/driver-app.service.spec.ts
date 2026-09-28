import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DriverAppService } from '../src/driver-app/driver-app.service';

function makeService(ride: any, driver: any = {}) {
  const prisma = {
    ride: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue(ride),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      aggregate: jest.fn().mockResolvedValue({ _avg: { customerRating: 4.5 } }),
    },
    customer: { update: jest.fn() },
    driver: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(driver),
      update: jest.fn(),
    },
  } as any;
  const drivers = { findOne: jest.fn().mockResolvedValue({ id: 'driver-A', name: 'Motorista Teste' }), updateAvailability: jest.fn(), updateLocation: jest.fn(), updatePayment: jest.fn(), heartbeat: jest.fn().mockResolvedValue({ availability: 'AVAILABLE' }) } as any;
  const rides = {
    findOne: jest.fn().mockResolvedValue(ride),
    advanceStatus: jest.fn().mockResolvedValue({ ...ride, status: 'DRIVER_EN_ROUTE' }),
    redispatch: jest.fn().mockResolvedValue({ ...ride, status: 'SEARCHING_DRIVER' }),
  } as any;
  const notifications = { create: jest.fn() } as any;
  return { service: new DriverAppService(prisma, drivers, rides, notifications), prisma, notifications, rides, drivers };
}

describe('DriverAppService ownership checks', () => {
  it('rejects accepting a ride assigned to a different driver', async () => {
    const { service } = makeService({ id: 'ride-1', driverId: 'driver-A', driver: { name: 'Carlos Silva' } });
    await expect(service.acceptRide('driver-B', 'ride-1')).rejects.toThrow(ForbiddenException);
  });

  it('rejects declining a ride assigned to a different driver', async () => {
    const { service } = makeService({ id: 'ride-1', driverId: 'driver-A', driver: { name: 'Carlos Silva' } });
    await expect(service.declineRide('driver-B', 'ride-1')).rejects.toThrow(ForbiddenException);
  });

  it('allows the assigned driver to accept their own ride', async () => {
    const { service } = makeService({ id: 'ride-1', driverId: 'driver-A', driver: { name: 'Carlos Silva' } });
    await expect(service.acceptRide('driver-A', 'ride-1')).resolves.toBeDefined();
  });

  it('forwards the decline reason to redispatch, attributed to the declining driver', async () => {
    const { service, rides } = makeService({ id: 'ride-1', driverId: 'driver-A', driver: { name: 'Carlos Silva' } });
    await service.declineRide('driver-A', 'ride-1', 'Muito longe');
    expect(rides.redispatch).toHaveBeenCalledWith('ride-1', { type: 'driver', id: 'driver-A', label: 'Carlos Silva' }, 'Muito longe');
  });
});

describe('DriverAppService rateCustomer', () => {
  const completedRide = { id: 'ride-1', driverId: 'driver-A', status: 'COMPLETED', customerRating: null, customer: { id: 'customer-1' } };

  it('rejects rating before the ride is completed', async () => {
    const { service } = makeService({ ...completedRide, status: 'IN_PROGRESS' });
    await expect(service.rateCustomer('driver-A', 'ride-1', 5)).rejects.toThrow(BadRequestException);
  });

  it('rejects rating the same ride twice', async () => {
    const { service } = makeService({ ...completedRide, customerRating: 4 });
    await expect(service.rateCustomer('driver-A', 'ride-1', 5)).rejects.toThrow(BadRequestException);
  });

  it('recomputes the customer average after rating', async () => {
    const { service, prisma } = makeService(completedRide);
    await service.rateCustomer('driver-A', 'ride-1', 5);
    expect(prisma.ride.updateMany).toHaveBeenCalledWith({ where: { id: 'ride-1', customerRating: null }, data: { customerRating: 5 } });
    expect(prisma.customer.update).toHaveBeenCalledWith({ where: { id: 'customer-1' }, data: { rating: 4.5 } });
  });
});

describe('DriverAppService setAvailability', () => {
  it('refuses to change availability while the driver has an active ride', async () => {
    const { service, prisma } = makeService(null);
    prisma.ride.findFirst.mockResolvedValue({ id: 'ride-1' });
    await expect(service.setAvailability('driver-A', 'OFFLINE')).rejects.toThrow(BadRequestException);
  });

  it('updates availability when the driver is idle', async () => {
    const { service, drivers } = makeService(null) as any;
    await service.setAvailability('driver-A', 'AVAILABLE');
    expect(drivers.updateAvailability).toHaveBeenCalledWith('driver-A', 'AVAILABLE');
  });
});

describe('DriverAppService passenger phone', () => {
  const customer = { id: 'c1', name: 'Maria', phone: '11999990000' };

  it('hides the passenger phone while the ride is only an offer, but keeps name and addresses', async () => {
    const { service, prisma } = makeService(null);
    prisma.ride.findFirst.mockResolvedValue({ id: 'ride-1', status: 'DRIVER_ASSIGNED', originAddress: 'A', customer });

    const { ride } = (await service.currentRide('driver-A')) as any;

    expect(ride.customer.phone).toBeUndefined();
    expect(ride.customer.name).toBe('Maria');
    expect(ride.originAddress).toBe('A');
  });

  it('gives the phone back once the driver accepted', async () => {
    const { service, prisma } = makeService(null);
    for (const status of ['DRIVER_EN_ROUTE', 'PASSENGER_ABOARD', 'IN_PROGRESS']) {
      prisma.ride.findFirst.mockResolvedValue({ id: 'ride-1', status, customer });
      expect(((await service.currentRide('driver-A')) as any).ride.customer.phone).toBe('11999990000');
    }
  });

  it('also hides it in the scheduled list until accepted', async () => {
    const { service, prisma } = makeService(null);
    prisma.ride.findMany.mockResolvedValue([
      { id: 'r1', status: 'DRIVER_ASSIGNED', customer },
      { id: 'r2', status: 'DRIVER_EN_ROUTE', customer },
    ]);

    const rides = await service.scheduledRides('driver-A');

    expect(rides[0].customer.phone).toBeUndefined();
    expect(rides[1].customer.phone).toBe('11999990000');
  });

  it('returns no ride when there is none', async () => {
    const { service } = makeService(null);
    await expect(service.currentRide('driver-A')).resolves.toEqual({ ride: null });
  });
});

describe('DriverAppService payment settings', () => {
  it('lets the driver change how he receives, through the audited service method', async () => {
    const { service, drivers } = makeService(null);
    await service.updatePayment('driver-A', { pixKey: 'a@b.com', hasCardMachine: true });
    expect(drivers.updatePayment).toHaveBeenCalledWith('driver-A', { pixKey: 'a@b.com', hasCardMachine: true });
  });
});

describe('DriverAppService presence', () => {
  it('forwards the heartbeat and marks app location updates as presence', async () => {
    const { service, drivers } = makeService(null);
    await expect(service.heartbeat('driver-A')).resolves.toEqual({ availability: 'AVAILABLE' });
    await service.updateLocation('driver-A', 1, 2);
    expect(drivers.updateLocation).toHaveBeenCalledWith('driver-A', { lat: 1, lng: 2 }, true);
  });
});

describe('DriverAppService sendNote', () => {
  it('rejects sending a note for a ride assigned to a different driver', async () => {
    const { service } = makeService({ id: 'ride-1', driverId: 'driver-A' });
    await expect(service.sendNote('driver-B', 'ride-1', 'oi')).rejects.toThrow(ForbiddenException);
  });

  it('creates an internal notification for the central', async () => {
    const { service, notifications } = makeService({ id: 'ride-1', driverId: 'driver-A' });
    await service.sendNote('driver-A', 'ride-1', 'trânsito parado');
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'INTERNAL', message: 'trânsito parado', targetType: 'admin', targetId: 'ride-1' }),
    );
  });
});

describe('DriverAppService changePassword', () => {
  it('rejects the wrong current password', async () => {
    const passwordHash = await bcrypt.hash('senha-certa', 10);
    const { service } = makeService(null, { passwordHash });
    await expect(service.changePassword('driver-A', 'senha-errada', 'nova-senha')).rejects.toThrow(UnauthorizedException);
  });

  it('updates the hash when the current password matches', async () => {
    const passwordHash = await bcrypt.hash('senha-certa', 10);
    const { service, prisma } = makeService(null, { passwordHash });
    await service.changePassword('driver-A', 'senha-certa', 'nova-senha');
    expect(prisma.driver.update).toHaveBeenCalledWith({ where: { id: 'driver-A' }, data: { passwordHash: expect.any(String) } });
  });
});

describe('DriverAppService summary', () => {
  it('totals only the logged-in driver’s completed rides, for today and for the month', async () => {
    const { service, prisma } = makeService(null);
    prisma.ride.aggregate = jest
      .fn()
      .mockResolvedValueOnce({ _count: 3, _sum: { finalPrice: 75.5 } }) // hoje
      .mockResolvedValueOnce({ _count: 40, _sum: { finalPrice: 1234.9 } }); // mês

    const result = await service.summary('driver-A');

    expect(result).toEqual({ today: { rides: 3, total: 75.5 }, month: { rides: 40, total: 1234.9 } });
    for (const [args] of prisma.ride.aggregate.mock.calls) {
      expect(args.where.driverId).toBe('driver-A');
      expect(args.where.status).toBe('COMPLETED');
      expect(args.where.completedAt.gte).toBeInstanceOf(Date);
      expect(args.where.completedAt.lte).toBeInstanceOf(Date);
    }
    const [[day], [month]] = prisma.ride.aggregate.mock.calls;
    expect(month.where.completedAt.gte.getTime()).toBeLessThanOrEqual(day.where.completedAt.gte.getTime());
  });

  it('shows zeros (not an error) for a driver with no completed rides', async () => {
    const { service, prisma } = makeService(null);
    prisma.ride.aggregate = jest.fn().mockResolvedValue({ _count: 0, _sum: { finalPrice: null } });
    await expect(service.summary('driver-A')).resolves.toEqual({ today: { rides: 0, total: 0 }, month: { rides: 0, total: 0 } });
  });
});

describe('DriverAppService sendSupportMessage', () => {
  it('creates an internal notification for the central', async () => {
    const { service, notifications } = makeService(null);
    await service.sendSupportMessage('driver-A', 'preciso de ajuda');
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'INTERNAL', message: 'preciso de ajuda', targetType: 'admin', targetId: 'driver-A' }),
    );
  });
});
