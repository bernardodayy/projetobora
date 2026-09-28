import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerJwtPayload } from '../customer-app.types';

@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  async validate(payload: CustomerJwtPayload): Promise<CustomerJwtPayload> {
    // Mesmo segredo assina os tokens de admin e motorista; o discriminador
    // evita que um desses seja aceito aqui como se fosse de cliente.
    if (payload.type !== 'customer') throw new UnauthorizedException('Token inválido para este acesso');

    // Cliente bloqueado/excluído perde o acesso na hora, não só quando o
    // token de acesso (15 min) expirar.
    const customer = await this.prisma.customer.findUnique({ where: { id: payload.sub }, select: { status: true, deletedAt: true } });
    if (!customer || customer.deletedAt || customer.status === 'BLOCKED') throw new UnauthorizedException('Cliente inválido ou bloqueado');
    return payload;
  }
}
