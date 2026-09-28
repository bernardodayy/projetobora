import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { DriverJwtPayload } from '../driver-app.types';

@Injectable()
export class DriverJwtStrategy extends PassportStrategy(Strategy, 'driver-jwt') {
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

  async validate(payload: DriverJwtPayload): Promise<DriverJwtPayload> {
    // Mesmo segredo assina os tokens do admin; o discriminador evita que um
    // token de admin seja aceito aqui como se fosse de motorista.
    if (payload.type !== 'driver') throw new UnauthorizedException('Token inválido para este acesso');

    // Motorista bloqueado/reprovado/excluído perde o acesso na hora, não só
    // quando o token de acesso (15 min) expirar.
    const driver = await this.prisma.driver.findUnique({ where: { id: payload.sub }, select: { status: true, deletedAt: true } });
    if (!driver || driver.deletedAt || driver.status !== 'APPROVED') throw new UnauthorizedException('Motorista inválido ou bloqueado');
    return payload;
  }
}
