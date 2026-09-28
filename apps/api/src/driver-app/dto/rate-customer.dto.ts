import { IsInt, Max, Min } from 'class-validator';

export class RateCustomerDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;
}
