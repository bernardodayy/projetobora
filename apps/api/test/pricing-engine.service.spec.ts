import { PricingEngineService } from '../src/pricing/pricing-engine.service';

const CONFIG = {
  id: 'config-1',
  baseFare: 8,
  perKm: 2.5,
  perMinute: 0.3,
  minimumFare: 8,
  combinationStrategy: 'HIGHEST_MULTIPLIER',
};

const ZONE = {
  id: 'zone-1',
  name: 'Zona Evento',
  shape: 'CIRCLE',
  geometry: { center: { lat: -23.55, lng: -46.63 }, radiusMeters: 2000 },
  multiplier: 1.1,
  fixedPrice: null,
  minimumFare: null,
  perKm: null,
  perMinute: null,
  baseFare: null,
  priority: 1,
  daysOfWeek: [],
  startTime: null,
  endTime: null,
  startDate: null,
  endDate: null,
};

const SCHEDULE = {
  id: 'schedule-1',
  name: 'Noite',
  multiplier: 1.4,
  daysOfWeek: [],
  startTime: null,
  endTime: null,
  priority: 0,
};

function makeEngine({
  config = CONFIG,
  zones = [ZONE] as any[],
  schedules = [SCHEDULE] as any[],
  distanceKm = 10,
  durationMin = 20,
} = {}) {
  const prisma = {
    pricingConfiguration: { findFirst: jest.fn().mockResolvedValue(config) },
    pricingZone: { findMany: jest.fn().mockResolvedValue(zones) },
    pricingSchedule: { findMany: jest.fn().mockResolvedValue(schedules) },
  } as any;
  const distance = { calculate: jest.fn().mockResolvedValue({ distanceKm, durationMin, source: 'estimated' }) } as any;
  return new PricingEngineService(prisma, distance);
}

const ORIGIN = { lat: -23.55, lng: -46.63 }; // dentro da zona de exemplo
const DESTINATION = { lat: -23.56, lng: -46.64 };
const NOW = new Date();

describe('PricingEngineService.calculate', () => {
  it('applies the higher of the two multipliers under HIGHEST_MULTIPLIER', async () => {
    const engine = makeEngine();
    const result = await engine.calculate(ORIGIN, DESTINATION, NOW);
    expect(result.appliedMultiplier).toBe(1.4);
    // subtotal = 8 + 2.5*10 + 0.3*20 = 39; 39 * 1.4 = 54.6
    expect(result.finalPrice).toBeCloseTo(54.6, 2);
  });

  it('multiplies both multipliers under MULTIPLY_ALL', async () => {
    const engine = makeEngine({ config: { ...CONFIG, combinationStrategy: 'MULTIPLY_ALL' } });
    const result = await engine.calculate(ORIGIN, DESTINATION, NOW);
    expect(result.appliedMultiplier).toBeCloseTo(1.1 * 1.4, 2);
  });

  it('uses only the zone multiplier under ZONE_PRIORITY, ignoring the schedule', async () => {
    const engine = makeEngine({ config: { ...CONFIG, combinationStrategy: 'ZONE_PRIORITY' } });
    const result = await engine.calculate(ORIGIN, DESTINATION, NOW);
    expect(result.appliedMultiplier).toBe(1.1);
  });

  it('uses only the schedule multiplier under SCHEDULE_PRIORITY, ignoring the zone', async () => {
    const engine = makeEngine({ config: { ...CONFIG, combinationStrategy: 'SCHEDULE_PRIORITY' } });
    const result = await engine.calculate(ORIGIN, DESTINATION, NOW);
    expect(result.appliedMultiplier).toBe(1.4);
  });

  it('charges the zone fixed price under ZONE_FIXED_VALUE when set', async () => {
    const fixedZone = { ...ZONE, fixedPrice: 25 };
    const engine = makeEngine({ config: { ...CONFIG, combinationStrategy: 'ZONE_FIXED_VALUE' }, zones: [fixedZone] });
    const result = await engine.calculate(ORIGIN, DESTINATION, NOW);
    expect(result.finalPrice).toBe(25);
  });

  it('never charges below the minimum fare', async () => {
    const engine = makeEngine({ config: { ...CONFIG, minimumFare: 100 }, zones: [], schedules: [] });
    const result = await engine.calculate(ORIGIN, DESTINATION, NOW);
    expect(result.finalPrice).toBe(100);
  });

  it('ignores a zone whose geometry does not contain the origin point', async () => {
    const farZone = { ...ZONE, geometry: { center: { lat: 10, lng: 10 }, radiusMeters: 100 } };
    const engine = makeEngine({ zones: [farZone] });
    const result = await engine.calculate(ORIGIN, DESTINATION, NOW);
    expect(result.zone).toBeNull();
  });
});
