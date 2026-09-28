export interface DriverJwtPayload {
  type: 'driver';
  sub: string;
  cpf: string;
}

export type AuthenticatedDriver = DriverJwtPayload;
