import { IsDateString, IsIn, IsLatitude, IsLongitude, IsOptional, IsString, MinLength } from 'class-validator';

const PAYMENT_METHODS = ['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'WALLET'] as const;

// Sem customerId nem driverId: o cliente só pode pedir corrida para si mesmo
// (id vem do token) e nunca escolhe o motorista (sempre despacho automático).
export class RequestRideDto {
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
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: (typeof PAYMENT_METHODS)[number];

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
