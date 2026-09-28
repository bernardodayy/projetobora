import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateDespachoDto {
  // Quanto tempo o motorista tem para aceitar antes da corrida passar ao próximo.
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(300)
  tempoOfertaSegundos?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  tempoEsperaMinutos?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  distanciaMaximaKm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  tentativasDespacho?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  raioProcuraKm?: number;
}
