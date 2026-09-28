import { IsEmail, IsOptional, IsString } from 'class-validator';

// Sem nomeEmpresa/corPrimaria/logoUrl de propósito: a marca é definida pelos
// desenvolvedores via BRAND_* no ambiente (ver SettingsService.getBranding).
// Como o ValidationPipe usa forbidNonWhitelisted, tentar enviar esses campos
// pelo painel/API é rejeitado com 400 em vez de ser ignorado em silêncio.
export class UpdateSistemaDto {
  @IsOptional()
  @IsString()
  telefone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
