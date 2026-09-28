import { IsIn } from 'class-validator';

const AVAILABILITIES = ['OFFLINE', 'AVAILABLE', 'BUSY', 'EN_ROUTE', 'WAITING_PASSENGER'] as const;

export class UpdateAvailabilityDto {
  @IsIn(AVAILABILITIES)
  availability!: (typeof AVAILABILITIES)[number];
}
