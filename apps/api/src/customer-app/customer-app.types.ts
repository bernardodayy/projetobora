export interface CustomerJwtPayload {
  type: 'customer';
  sub: string;
  cpf: string;
}

export type AuthenticatedCustomer = CustomerJwtPayload;
