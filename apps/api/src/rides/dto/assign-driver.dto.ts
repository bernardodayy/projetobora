import { IsUUID } from 'class-validator';

export class AssignDriverDto {
  @IsUUID()
  driverId!: string;
}
