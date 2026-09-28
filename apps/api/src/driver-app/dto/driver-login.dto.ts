import { IsString, Matches, MinLength } from 'class-validator';

export class DriverLoginDto {
  @Matches(/^\d{11}$/, { message: 'CPF deve conter 11 dígitos' })
  cpf!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
