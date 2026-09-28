export interface JwtPayload {
  type: 'admin';
  sub: string;
  email: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

// `name` vem do banco a cada requisição (JwtStrategy), não do token.
export type AuthenticatedUser = JwtPayload & { name?: string };
