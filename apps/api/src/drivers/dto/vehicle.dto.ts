import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class VehicleDto {
  @IsString()
  @MinLength(5)
  plate!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @IsString()
  @MinLength(1)
  brand!: string;

  @IsOptional()
  @IsInt()
  @Min(1990)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsString()
  color?: string;
}
