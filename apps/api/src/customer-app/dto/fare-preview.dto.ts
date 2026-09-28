import { IsLatitude, IsLongitude, IsOptional, IsString } from 'class-validator';

export class FarePreviewDto {
  @IsLatitude()
  originLat!: number;

  @IsLongitude()
  originLng!: number;

  @IsLatitude()
  destinationLat!: number;

  @IsLongitude()
  destinationLng!: number;

  @IsOptional()
  @IsString()
  couponCode?: string;
}
