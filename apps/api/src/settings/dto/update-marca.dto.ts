import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateMarcaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nomeEmpresa?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'corPrimaria deve ser um hexadecimal no formato #RRGGBB' })
  corPrimaria?: string;

  @IsOptional()
  @Matches(/^$|^https?:\/\/.+/, { message: 'logoUrl deve ser uma URL http(s) ou vazio' })
  logoUrl?: string;
}
