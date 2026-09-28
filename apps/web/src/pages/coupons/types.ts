export type CouponDiscountType = 'PERCENTAGE' | 'FIXED';

export interface Coupon {
  code: string;
  discountType: CouponDiscountType;
  discountValue: string;
  maxUses: number | null;
  usesCount: number;
  maxUsesPerCustomer: number | null;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
}
