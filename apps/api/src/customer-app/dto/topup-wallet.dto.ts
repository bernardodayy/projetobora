import { IsNumber, Max, Min } from 'class-validator';

export class TopUpWalletDto {
  // Teto e 2 casas: a coluna é Decimal(10,2) — sem isso um valor absurdo estoura
  // o banco (500) em vez de virar erro de validação.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1000)
  amount!: number;
}
