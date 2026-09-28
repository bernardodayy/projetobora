import { IsString } from 'class-validator';

export class CustomerRefreshDto {
  @IsString()
  refreshToken!: string;
}
