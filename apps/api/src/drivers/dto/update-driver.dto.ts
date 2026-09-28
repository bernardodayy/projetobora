import { Type } from 'class-transformer';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { VehicleDto } from './vehicle.dto';

export class UpdateDriverDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  cnh?: string;

  @IsOptional()
  @IsString()
  cnhCategory?: string;

  @IsOptional()
  @IsObject()
  bankInfo?: Record<string, string>;

  // Chave Pix onde o passageiro paga o motorista no fim da corrida.
  @IsOptional()
  @IsString()
  @MaxLength(140)
  pixKey?: string;

  // Tem máquina de cartão no carro (só esses recebem corrida paga no cartão).
  @IsOptional()
  @IsBoolean()
  hasCardMachine?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => VehicleDto)
  vehicle?: VehicleDto;
}
