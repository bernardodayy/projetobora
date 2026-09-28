import { NotificationsService } from '../src/notifications/notifications.service';

function makeService() {
  const prisma = {
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(3),
      updateMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
  } as any;
  return { service: new NotificationsService(prisma, {} as any), prisma };
}

describe('NotificationsService bell support', () => {
  it('counts only the unread notifications addressed to the panel', async () => {
    const { service, prisma } = makeService();
    await expect(service.unreadCount()).resolves.toEqual({ count: 3 });
    expect(prisma.notification.count).toHaveBeenCalledWith({ where: { targetType: 'admin', readAt: null } });
  });

  it('marks every unread notification as read in one statement and leaves the already read ones alone', async () => {
    const { service, prisma } = makeService();
    await expect(service.markAllRead()).resolves.toEqual({ count: 3 });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({ where: { targetType: 'admin', readAt: null }, data: { readAt: expect.any(Date) } });
  });

  it('lists only unread ones when asked, all of them otherwise, with the same filter for rows and total', async () => {
    const { service, prisma } = makeService();
    await service.findAll({ take: 8, skip: 0 }, true);
    await service.findAll({ take: 8, skip: 0 });

    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({ targetType: 'admin', readAt: null });
    expect(prisma.notification.count.mock.calls[0][0]).toEqual({ where: { targetType: 'admin', readAt: null } });
    expect(prisma.notification.findMany.mock.calls[1][0].where).toEqual({ targetType: 'admin' });
  });
});
