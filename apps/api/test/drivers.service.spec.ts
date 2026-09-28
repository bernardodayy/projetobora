import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DriversService } from '../src/drivers/drivers.service';

function makeService(driver: any): any {
  const prisma = {
    driver: {
      findFirst: jest.fn().mockResolvedValue(driver),
      update: jest.fn().mockResolvedValue(driver),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as any;
  const audit = { log: jest.fn() } as any;
  const realtime = { broadcastDriverUpdated: jest.fn() } as any;
  const notifications = { create: jest.fn() } as any;
  const service = new DriversService(prisma, audit, realtime, notifications);
  return Object.assign(service, { prisma, realtime });
}

const baseDriver = {
  id: 'driver-1',
  status: 'PENDING',
  deletedAt: null,
  vehicles: [],
  documents: [],
  blocks: [],
};

describe('DriversService status transitions', () => {
  it('approves a pending driver', async () => {
    const service = makeService(baseDriver);
    await expect(service.approve('driver-1', 'admin-1')).resolves.toBeDefined();
  });

  it('refuses to approve a driver that is not pending', async () => {
    const service = makeService({ ...baseDriver, status: 'APPROVED' });
    await expect(service.approve('driver-1', 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('refuses to reject a driver that is not pending', async () => {
    const service = makeService({ ...baseDriver, status: 'BLOCKED' });
    await expect(service.reject('driver-1', { reason: 'documentos inválidos' }, 'admin-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses to unblock a driver that is not blocked', async () => {
    const service = makeService({ ...baseDriver, status: 'APPROVED' });
    await expect(service.unblock('driver-1', 'admin-1')).rejects.toThrow(BadRequestException);
  });
});

describe('DriversService presence', () => {
  const approved = { ...baseDriver, status: 'APPROVED' };

  it('records a sign of life on heartbeat and reports the real availability back', async () => {
    const service = makeService(approved) as any;
    service.prisma.driver.update.mockResolvedValue({ availability: 'OFFLINE' });
    await expect(service.heartbeat('driver-1')).resolves.toEqual({ availability: 'OFFLINE' });
    expect(service.prisma.driver.update.mock.calls[0][0].data.lastSeenAt).toBeInstanceOf(Date);
  });

  it('only counts a location update as presence when it comes from the driver app', async () => {
    const service = makeService(approved) as any;
    await service.updateLocation('driver-1', { lat: 1, lng: 2 });
    expect(service.prisma.driver.update.mock.calls[0][0].data).not.toHaveProperty('lastSeenAt');
    await service.updateLocation('driver-1', { lat: 1, lng: 2 }, true);
    expect(service.prisma.driver.update.mock.calls[1][0].data.lastSeenAt).toBeInstanceOf(Date);
  });

  it('gives a grace period when a driver is set available, but not when set offline', async () => {
    const service = makeService(approved) as any;
    await service.updateAvailability('driver-1', 'AVAILABLE');
    await service.updateAvailability('driver-1', 'OFFLINE');
    expect(service.prisma.driver.update.mock.calls[0][0].data.lastSeenAt).toBeInstanceOf(Date);
    expect(service.prisma.driver.update.mock.calls[1][0].data).not.toHaveProperty('lastSeenAt');
  });

  it('puts available drivers with no recent sign of life offline and tells the Central', async () => {
    const service = makeService(approved) as any;
    service.prisma.driver.findMany.mockResolvedValue([{ id: 'ghost' }]);
    service.prisma.driver.update.mockResolvedValue({ id: 'ghost', availability: 'OFFLINE' });

    await service.expireStalePresence();

    const query = service.prisma.driver.findMany.mock.calls[0][0].where;
    expect(query.availability).toBe('AVAILABLE');
    expect(query.OR).toEqual([{ lastSeenAt: null }, { lastSeenAt: { lt: expect.any(Date) } }]);
    expect(service.prisma.driver.update).toHaveBeenCalledWith({ where: { id: 'ghost', availability: 'AVAILABLE' }, data: { availability: 'OFFLINE' } });
    expect(service.realtime.broadcastDriverUpdated).toHaveBeenCalledWith({ id: 'ghost', availability: 'OFFLINE' });
  });

  it('leaves a driver alone when dispatch claimed them between the check and the update', async () => {
    const service = makeService(approved) as any;
    service.prisma.driver.findMany.mockResolvedValue([{ id: 'busy-now' }]);
    service.prisma.driver.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 't' }));

    await expect(service.expireStalePresence()).resolves.toBeUndefined();
    expect(service.realtime.broadcastDriverUpdated).not.toHaveBeenCalled();
  });
});

describe('DriversService receiving payments', () => {
  const approved = { ...baseDriver, status: 'APPROVED', name: 'Carlos', pixKey: 'antiga@pix.com', hasCardMachine: false };

  it('the driver changing his own Pix key is audited with before and after', async () => {
    const service = makeService(approved);
    service.prisma.driver.update.mockResolvedValue({ ...approved, pixKey: 'nova@pix.com', hasCardMachine: true });
    (service as any).audit.log = jest.fn();
    const audit = (service as any).audit;

    await service.updatePayment('driver-1', { pixKey: ' nova@pix.com ', hasCardMachine: true });

    expect(service.prisma.driver.update.mock.calls[0][0].data).toEqual({ pixKey: 'nova@pix.com', hasCardMachine: true });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'driver',
        actorLabel: 'Carlos',
        action: 'UPDATE_PAYMENT',
        before: { pixKey: 'antiga@pix.com', hasCardMachine: false },
        after: { pixKey: 'nova@pix.com', hasCardMachine: true },
      }),
    );
  });

  it('a blank Pix key becomes "no key" so dispatch does not think the driver has one', async () => {
    const service = makeService(approved);
    await service.updatePayment('driver-1', { pixKey: '   ' });
    expect(service.prisma.driver.update.mock.calls[0][0].data).toEqual({ pixKey: null });
  });

  it('only touches the fields that were sent', async () => {
    const service = makeService(approved);
    await service.updatePayment('driver-1', { hasCardMachine: true });
    expect(service.prisma.driver.update.mock.calls[0][0].data).toEqual({ hasCardMachine: true });
  });

  it('the Central editing a driver also normalises a blank Pix key', async () => {
    const service = makeService(approved);
    await service.update('driver-1', { name: 'Carlos Silva', pixKey: '' } as any, 'admin-1');
    expect(service.prisma.driver.update.mock.calls[0][0].data).toEqual({ name: 'Carlos Silva', pixKey: null });
  });
});
