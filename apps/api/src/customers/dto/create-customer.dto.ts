import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { IsCpf } from '../../common/cpf';

export class CreateCustomerDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsCpf()
  cpf!: string;

  @IsString()
  @MinLength(8)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
