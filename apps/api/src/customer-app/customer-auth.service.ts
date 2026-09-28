import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hashToken, parseDurationMs } from '../common/token.util';
import { CustomerJwtPayload } from './customer-app.types';

@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private async validateCredentials(cpf: string, password: string) {
    const customer = await this.prisma.customer.findUnique({ where: { cpf } });

    if (!customer || customer.deletedAt) throw new UnauthorizedException('Credenciais inválidas');
    if (customer.status === 'BLOCKED') throw new UnauthorizedException('Cliente bloqueado');
    if (!customer.passwordHash) throw new UnauthorizedException('Senha ainda não definida — fale com a central');

    const passwordMatches = await bcrypt.compare(password, customer.passwordHash);
    if (!passwordMatches) throw new UnauthorizedException('Credenciais inválidas');

    return customer;
  }

  private buildPayload(customerId: string, cpf: string): CustomerJwtPayload {
    return { type: 'customer', sub: customerId, cpf };
  }

  private async issueTokens(payload: CustomerJwtPayload) {
    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN'),
    });

    const refreshTokenPlain = randomBytes(48).toString('hex');
    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN')!;
    await this.prisma.customerRefreshToken.create({
      data: {
        customerId: payload.sub,
        tokenHash: hashToken(refreshTokenPlain),
        expiresAt: new Date(Date.now() + parseDurationMs(refreshExpiresIn)),
      },
    });

    return { accessToken, refreshToken: refreshTokenPlain };
  }

  async login(cpf: string, password: string) {
    const customer = await this.validateCredentials(cpf, password);
    const payload = this.buildPayload(customer.id, customer.cpf);
    const tokens = await this.issueTokens(payload);
    return { ...tokens, customer: { id: customer.id, name: customer.name, cpf: customer.cpf } };
  }

  async refresh(refreshTokenPlain: string) {
    const tokenHash = hashToken(refreshTokenPlain);
    const stored = await this.prisma.customerRefreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    const customer = await this.prisma.customer.findUnique({ where: { id: stored.customerId } });
    if (!customer || customer.status === 'BLOCKED' || customer.deletedAt) {
      throw new UnauthorizedException('Cliente inválido');
    }

    await this.prisma.customerRefreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    const payload = this.buildPayload(customer.id, customer.cpf);
    return this.issueTokens(payload);
  }

  async logout(refreshTokenPlain: string) {
    const tokenHash = hashToken(refreshTokenPlain);
    await this.prisma.customerRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
