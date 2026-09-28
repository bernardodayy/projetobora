import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

const DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED'] as const;

export class CreateCouponDto {
  @Matches(/^[A-Z0-9]{4,20}$/, { message: 'Código deve ter 4-20 letras maiúsculas/números' })
  code!: string;

  @IsIn(DISCOUNT_TYPES)
  discountType!: (typeof DISCOUNT_TYPES)[number];

  @IsNumber()
  @Min(0.01)
  discountValue!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsesPerCustomer?: number;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}
