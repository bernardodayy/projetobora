import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class DriverJwtAuthGuard extends AuthGuard('driver-jwt') {}
