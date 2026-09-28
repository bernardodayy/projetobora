import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';

const STRATEGIES = ['HIGHEST_MULTIPLIER', 'MULTIPLY_ALL', 'ZONE_PRIORITY', 'SCHEDULE_PRIORITY', 'ZONE_FIXED_VALUE'] as const;

export class UpdatePricingConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseFare?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  perKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  perMinute?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumFare?: number;

  @IsOptional()
  @IsIn(STRATEGIES)
  combinationStrategy?: (typeof STRATEGIES)[number];
}
