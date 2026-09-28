import { IsIn } from 'class-validator';

const ADVANCEABLE_STATUSES = [
  'SEARCHING_DRIVER',
  'DRIVER_EN_ROUTE',
  'PASSENGER_ABOARD',
  'IN_PROGRESS',
  'COMPLETED',
] as const;

export class AdvanceStatusDto {
  @IsIn(ADVANCEABLE_STATUSES)
  status!: (typeof ADVANCEABLE_STATUSES)[number];
}
