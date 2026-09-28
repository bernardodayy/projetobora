import { IsDateString, IsLatitude, IsLongitude, IsOptional } from 'class-validator';

export class SimulateDto {
  @IsLatitude()
  originLat!: number;

  @IsLongitude()
  originLng!: number;

  @IsLatitude()
  destinationLat!: number;

  @IsLongitude()
  destinationLng!: number;

  @IsOptional()
  @IsDateString()
  at?: string;
}
