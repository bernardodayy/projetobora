import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class CreatePricingScheduleDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @Matches(/^\d{2}:\d{2}$/)
  endTime!: string;

  @IsNumber()
  multiplier!: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
