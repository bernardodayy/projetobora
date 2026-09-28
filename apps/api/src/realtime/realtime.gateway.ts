import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { stripSecrets } from '../common/strip-secrets';

// Sala só dos usuários do painel: os broadcasts globais (corridas, motoristas,
// notificações) carregam dados de todo mundo e não podem chegar a nenhum socket
// de cliente/motorista — antes usavam server.emit() e iam pra todas as conexões.
const ADMIN_ROOM = 'admins';

@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()), credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    try {
      if (!token) throw new Error('missing token');
      const payload = this.jwtService.verify<{ type?: string; sub: string }>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      // Motoristas e clientes entram numa sala própria: cada app só deve ouvir
      // atualizações da própria corrida, nunca o broadcast global (que carrega
      // dados de outras pessoas). Só admin entra na sala que recebe tudo.
      if (payload.type === 'admin') client.join(ADMIN_ROOM);
      if (payload.type === 'driver') client.join(`driver:${payload.sub}`);
      if (payload.type === 'customer') client.join(`customer:${payload.sub}`);
    } catch {
      this.logger.warn(`Conexão WebSocket rejeitada (token inválido): ${client.id}`);
      client.disconnect();
    }
  }

  broadcastRideUpdated(ride: unknown) {
    this.server?.to(ADMIN_ROOM).emit('ride.updated', stripSecrets(ride));
  }

  broadcastDriverUpdated(driver: unknown) {
    this.server?.to(ADMIN_ROOM).emit('driver.updated', stripSecrets(driver));
  }

  broadcastNotificationCreated(notification: unknown) {
    this.server?.to(ADMIN_ROOM).emit('notification.created', stripSecrets(notification));
  }

  notifyDriver(driverId: string, event: string) {
    this.server?.to(`driver:${driverId}`).emit(event);
  }

  notifyCustomer(customerId: string, event: string) {
    this.server?.to(`customer:${customerId}`).emit(event);
  }
}
