import { IsDateString, IsIn, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

const PAYMENT_METHODS = ['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'WALLET'] as const;

export class CreateRideDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsString()
  @MinLength(5)
  originAddress!: string;

  @IsLatitude()
  originLat!: number;

  @IsLongitude()
  originLng!: number;

  @IsString()
  @MinLength(5)
  destinationAddress!: string;

  @IsLatitude()
  destinationLat!: number;

  @IsLongitude()
  destinationLng!: number;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: (typeof PAYMENT_METHODS)[number];

  @IsOptional()
  @IsString()
  couponCode?: string;
}
