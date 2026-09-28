import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Page } from '../common/pagination';

interface CreateNotificationInput {
  channel: 'PUSH' | 'EMAIL' | 'SMS' | 'INTERNAL';
  title: string;
  message: string;
  targetType: string;
  targetId?: string;
  sourceType?: 'customer' | 'driver';
  sourceId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({ data: input });
    this.realtime.broadcastNotificationCreated(notification);
    return notification;
  }

  // `unread`: só as que ninguém marcou como lida (alimenta o sino da Central).
  async findAll(paging: { take: number; skip: number }, unread = false) {
    const where = { targetType: 'admin', ...(unread ? { readAt: null } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...paging }), // id: desempate estável entre páginas
      this.prisma.notification.count({ where }),
    ]);
    return new Page(items, total);
  }

  unreadCount() {
    return this.prisma.notification.count({ where: { targetType: 'admin', readAt: null } }).then((count) => ({ count }));
  }

  async markAllRead() {
    const { count } = await this.prisma.notification.updateMany({ where: { targetType: 'admin', readAt: null }, data: { readAt: new Date() } });
    return { count };
  }

  markRead(id: string) {
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  // "Fale conosco" via de mão única antes: o cliente/motorista mandava e
  // nunca via se alguém respondeu dentro do app. Aqui é só um par
  // pergunta-resposta (não um chat de verdade — isso já foi decidido fora de
  // escopo), então um campo reply na própria notificação basta.
  async reply(id: string, replyMessage: string) {
    const notification = await this.prisma.notification.update({
      where: { id },
      data: { reply: replyMessage, repliedAt: new Date() },
    });
    if (notification.sourceType === 'customer' && notification.sourceId) {
      this.realtime.notifyCustomer(notification.sourceId, 'support-message.replied');
    } else if (notification.sourceType === 'driver' && notification.sourceId) {
      this.realtime.notifyDriver(notification.sourceId, 'support-message.replied');
    }
    return notification;
  }

  findBySource(sourceType: 'customer' | 'driver', sourceId: string) {
    return this.prisma.notification.findMany({
      where: { sourceType, sourceId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}
