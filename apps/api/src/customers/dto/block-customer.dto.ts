import { IsString, MinLength } from 'class-validator';

export class BlockCustomerDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
