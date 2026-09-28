import { IsLatitude, IsLongitude, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAddressDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsString()
  @MinLength(5)
  address!: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}
