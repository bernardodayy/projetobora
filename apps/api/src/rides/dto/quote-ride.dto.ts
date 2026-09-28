import { IsDateString, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID } from 'class-validator';

// Estimativa antes de criar a corrida (formulário da Central): mesmo cálculo de preço e mesma validação de
// cupom do POST /rides, sem gravar nada.
export class QuoteRideDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

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

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
