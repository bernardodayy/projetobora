export type CombinationStrategy = 'HIGHEST_MULTIPLIER' | 'MULTIPLY_ALL' | 'ZONE_PRIORITY' | 'SCHEDULE_PRIORITY' | 'ZONE_FIXED_VALUE';

export const STRATEGY_LABEL: Record<CombinationStrategy, string> = {
  HIGHEST_MULTIPLIER: 'Maior multiplicador (zona ou horário, o que for maior)',
  MULTIPLY_ALL: 'Multiplicação dos multiplicadores (zona × horário)',
  ZONE_PRIORITY: 'Prioridade da zona (ignora o horário se houver zona)',
  SCHEDULE_PRIORITY: 'Prioridade do horário (ignora a zona se houver horário)',
  ZONE_FIXED_VALUE: 'Valor fixo da zona (quando a zona define um preço fechado)',
};

export interface PricingConfig {
  id: string;
  baseFare: string;
  perKm: string;
  perMinute: string;
  minimumFare: string;
  combinationStrategy: CombinationStrategy;
}

export interface ConfigHistoryEntry {
  id: string;
  field: string;
  previousValue: string;
  newValue: string;
  changedByName: string | null;
  changedAt: string;
}

export interface PricingSchedule {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  multiplier: string;
  daysOfWeek: number[];
  priority: number;
  isActive: boolean;
}

export const WEEKDAY_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export interface SimulationResult {
  baseFare: number;
  distanceKm: number;
  distanceFare: number;
  durationMin: number;
  timeFare: number;
  minimumFare: number;
  zone: { id: string; name: string; multiplier: number | null; fixedPrice: number | null } | null;
  schedule: { id: string; name: string; multiplier: number } | null;
  combinationStrategy: CombinationStrategy;
  appliedMultiplier: number;
  finalPrice: number;
  distanceSource: 'google' | 'estimated';
}
