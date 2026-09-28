import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedDriver } from '../driver-app.types';

export const CurrentDriver = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedDriver => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
