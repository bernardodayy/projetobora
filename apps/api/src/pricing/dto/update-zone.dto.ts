import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

const SHAPES = ['POLYGON', 'CIRCLE'] as const;

export class UpdatePricingZoneDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsIn(SHAPES)
  shape?: (typeof SHAPES)[number];

  @IsOptional()
  @IsObject()
  geometry?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  multiplier?: number;

  @IsOptional()
  @IsNumber()
  fixedPrice?: number;

  @IsOptional()
  @IsNumber()
  minimumFare?: number;

  @IsOptional()
  @IsNumber()
  perKm?: number;

  @IsOptional()
  @IsNumber()
  perMinute?: number;

  @IsOptional()
  @IsNumber()
  baseFare?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  endTime?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
