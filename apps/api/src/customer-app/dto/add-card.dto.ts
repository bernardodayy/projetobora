import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

// Nunca coleta número completo do cartão nem CVV — só um rótulo de exibição
// (bandeira + últimos 4 dígitos + validade), escolhido pelo próprio cliente.
// Não existe gateway de pagamento real integrado em lugar nenhum do sistema.
export class AddCardDto {
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  brand!: string;

  @IsString()
  @Matches(/^\d{4}$/, { message: 'last4 deve ter exatamente 4 dígitos' })
  last4!: string;

  @IsString()
  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/, { message: 'expiry deve estar no formato MM/AA' })
  expiry!: string;
}
