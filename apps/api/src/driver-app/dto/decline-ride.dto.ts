import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeclineRideDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
