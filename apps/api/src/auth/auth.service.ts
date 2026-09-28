import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hashToken, parseDurationMs } from '../common/token.util';
import { JwtPayload } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateCredentials(email: string, password: string) {
    const user = await this.prisma.adminUser.findUnique({
      where: { email },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    if (!user || user.deletedAt) throw new UnauthorizedException('Credenciais inválidas');
    if (user.status === 'BLOCKED') throw new UnauthorizedException('Usuário bloqueado');

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) throw new UnauthorizedException('Credenciais inválidas');

    return user;
  }

  private buildPayload(user: Awaited<ReturnType<AuthService['validateCredentials']>>): JwtPayload {
    return {
      type: 'admin',
      sub: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: user.role.name,
      permissions: user.role.permissions.map((rp) => rp.permission.slug),
    };
  }

  private async issueTokens(payload: JwtPayload) {
    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN'),
    });

    const refreshTokenPlain = randomBytes(48).toString('hex');
    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN')!;
    await this.prisma.refreshToken.create({
      data: {
        userId: payload.sub,
        tokenHash: hashToken(refreshTokenPlain),
        expiresAt: new Date(Date.now() + parseDurationMs(refreshExpiresIn)),
      },
    });

    return { accessToken, refreshToken: refreshTokenPlain };
  }

  async login(email: string, password: string) {
    const user = await this.validateCredentials(email, password);
    const payload = this.buildPayload(user);
    const tokens = await this.issueTokens(payload);
    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.name,
        permissions: payload.permissions,
      },
    };
  }

  async refresh(refreshTokenPlain: string) {
    const tokenHash = hashToken(refreshTokenPlain);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    const user = await this.prisma.adminUser.findUnique({
      where: { id: stored.userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user || user.status === 'BLOCKED' || user.deletedAt) {
      throw new UnauthorizedException('Usuário inválido');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const payload = this.buildPayload(user);
    return this.issueTokens(payload);
  }

  async logout(refreshTokenPlain: string) {
    const tokenHash = hashToken(refreshTokenPlain);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
