import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { throttledLogin } from '../common/login-throttle';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedUser } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return throttledLogin(`admin|${req.ip}|${dto.email.toLowerCase()}`, () => this.authService.login(dto.email, dto.password));
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  async logout(@Body() dto: RefreshDto) {
    await this.authService.logout(dto.refreshToken);
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  // Mesmo formato do `user` que o login devolve — com o cargo e as permissões ATUAIS (a JwtStrategy relê do
  // banco a cada requisição). O painel chama isto ao abrir e ao ganhar foco pra o menu acompanhar mudanças
  // de cargo sem exigir novo login.
  me(@CurrentUser() user: AuthenticatedUser) {
    return { id: user.sub, name: user.name, email: user.email, role: user.roleName, permissions: user.permissions };
  }
}
