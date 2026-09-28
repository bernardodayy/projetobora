import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hashToken, parseDurationMs } from '../common/token.util';
import { DriverJwtPayload } from './driver-app.types';

@Injectable()
export class DriverAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private async validateCredentials(cpf: string, password: string) {
    const driver = await this.prisma.driver.findUnique({ where: { cpf } });

    if (!driver || driver.deletedAt) throw new UnauthorizedException('Credenciais inválidas');
    if (driver.status === 'BLOCKED') throw new UnauthorizedException('Motorista bloqueado');
    if (driver.status !== 'APPROVED') throw new UnauthorizedException('Cadastro ainda não aprovado');
    if (!driver.passwordHash) throw new UnauthorizedException('Senha ainda não definida — fale com a central');

    const passwordMatches = await bcrypt.compare(password, driver.passwordHash);
    if (!passwordMatches) throw new UnauthorizedException('Credenciais inválidas');

    return driver;
  }

  private buildPayload(driverId: string, cpf: string): DriverJwtPayload {
    return { type: 'driver', sub: driverId, cpf };
  }

  private async issueTokens(payload: DriverJwtPayload) {
    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN'),
    });

    const refreshTokenPlain = randomBytes(48).toString('hex');
    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN')!;
    await this.prisma.driverRefreshToken.create({
      data: {
        driverId: payload.sub,
        tokenHash: hashToken(refreshTokenPlain),
        expiresAt: new Date(Date.now() + parseDurationMs(refreshExpiresIn)),
      },
    });

    return { accessToken, refreshToken: refreshTokenPlain };
  }

  async login(cpf: string, password: string) {
    const driver = await this.validateCredentials(cpf, password);
    const payload = this.buildPayload(driver.id, driver.cpf);
    const tokens = await this.issueTokens(payload);
    return { ...tokens, driver: { id: driver.id, name: driver.name, cpf: driver.cpf, availability: driver.availability } };
  }

  async refresh(refreshTokenPlain: string) {
    const tokenHash = hashToken(refreshTokenPlain);
    const stored = await this.prisma.driverRefreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    const driver = await this.prisma.driver.findUnique({ where: { id: stored.driverId } });
    if (!driver || driver.status !== 'APPROVED' || driver.deletedAt) {
      throw new UnauthorizedException('Motorista inválido');
    }

    await this.prisma.driverRefreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    const payload = this.buildPayload(driver.id, driver.cpf);
    return this.issueTokens(payload);
  }

  async logout(refreshTokenPlain: string) {
    const tokenHash = hashToken(refreshTokenPlain);
    await this.prisma.driverRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
