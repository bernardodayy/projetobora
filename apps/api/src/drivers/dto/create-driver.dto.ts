import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { IsCpf } from '../../common/cpf';
import { VehicleDto } from './vehicle.dto';

export class CreateDriverDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsCpf()
  cpf!: string;

  @IsString()
  @MinLength(8)
  phone!: string;

  @IsString()
  @MinLength(5)
  cnh!: string;

  @IsString()
  cnhCategory!: string;

  @ValidateNested()
  @Type(() => VehicleDto)
  vehicle!: VehicleDto;

  // Chave Pix onde o passageiro paga o motorista no fim da corrida.
  @IsOptional()
  @IsString()
  @MaxLength(140)
  pixKey?: string;

  // Tem máquina de cartão no carro (só esses recebem corrida paga no cartão).
  @IsOptional()
  @IsBoolean()
  hasCardMachine?: boolean;

}
