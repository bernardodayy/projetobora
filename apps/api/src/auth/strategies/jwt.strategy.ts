import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser, JwtPayload } from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
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

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Mesmo segredo assina os tokens do app do motorista (driver-jwt); o discriminador
    // evita que um token de motorista seja aceito aqui como se fosse de admin.
    if (payload.type !== 'admin') throw new UnauthorizedException('Token inválido para este acesso');

    // Confere o usuário a cada requisição em vez de confiar no que o token
    // carregou há até 15 min: bloquear/excluir usuário ou trocar as permissões
    // do cargo passa a valer na hora, não só depois do próximo refresh.
    const user = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user || user.deletedAt || user.status === 'BLOCKED') throw new UnauthorizedException('Usuário inválido ou bloqueado');

    return {
      ...payload,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
      roleName: user.role.name,
      permissions: user.role.permissions.map((rp) => rp.permission.slug),
    };
  }
}
