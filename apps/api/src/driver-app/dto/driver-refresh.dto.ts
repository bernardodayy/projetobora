import { IsString } from 'class-validator';

export class DriverRefreshDto {
  @IsString()
  refreshToken!: string;
}
