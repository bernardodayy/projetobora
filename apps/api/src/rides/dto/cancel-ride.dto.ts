import { IsString, MinLength } from 'class-validator';

export class CancelRideDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
