import { IsString, MinLength } from 'class-validator';

export class ReasonDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
