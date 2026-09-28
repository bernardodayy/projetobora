import { IsIn } from 'class-validator';

// Só os dois estados que o motorista escolhe manualmente. BUSY/EN_ROUTE/
// WAITING_PASSENGER são consequência do despacho (ver RidesService), não uma
// opção no app.
const SELF_SERVICE_AVAILABILITIES = ['AVAILABLE', 'OFFLINE'] as const;

export class SetAvailabilityDto {
  @IsIn(SELF_SERVICE_AVAILABILITIES)
  availability!: (typeof SELF_SERVICE_AVAILABILITIES)[number];
}
