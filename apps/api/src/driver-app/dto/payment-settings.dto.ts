import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

// O próprio motorista mantém como recebe: chave Pix e se tem máquina de cartão.
export class PaymentSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(140)
  pixKey?: string;

  @IsOptional()
  @IsBoolean()
  hasCardMachine?: boolean;
}
