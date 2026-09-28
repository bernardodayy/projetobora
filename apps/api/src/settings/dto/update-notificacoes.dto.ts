import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificacoesDto {
  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  sms?: boolean;

  @IsOptional()
  @IsBoolean()
  internas?: boolean;
}
