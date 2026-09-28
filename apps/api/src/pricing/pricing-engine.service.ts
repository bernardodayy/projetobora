import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DistanceService } from './distance.service';
import { round2, type LatLng } from './geometry.util';
import { zonesContainingPoint } from '../common/postgis';
import { matchesDateRange, matchesDayAndTime } from './time-window.util';

export interface PricingBreakdown {
  baseFare: number;
  distanceKm: number;
  distanceFare: number;
  durationMin: number;
  timeFare: number;
  minimumFare: number;
  zone: { id: string; name: string; multiplier: number | null; fixedPrice: number | null } | null;
  schedule: { id: string; name: string; multiplier: number } | null;
  combinationStrategy: string;
  appliedMultiplier: number;
  finalPrice: number;
  distanceSource: 'google' | 'estimated';
}

@Injectable()
export class PricingEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly distance: DistanceService,
  ) {}

  // Dia/horário/data continuam em JS (não é espacial, e cada zona tem sua própria janela — nada que uma
  // consulta geoespacial resolva). Só o teste "o ponto está dentro desta geometria?" vai para o PostGIS
  // (ST_Contains, ver common/postgis.ts) — é o que ele faz bem, e substitui o ray casting/haversine feitos
  // em JS antes. A primeira zona (já em ordem de prioridade) cujo id aparece na resposta do PostGIS vence,
  // mesmo critério de "primeiro match" de antes.
  async findApplicableZone(point: LatLng, at: Date) {
    const zones = await this.prisma.pricingZone.findMany({ where: { isActive: true }, orderBy: { priority: 'desc' } });
    const active = zones.filter(
      (zone) =>
        matchesDateRange({ startDate: zone.startDate, endDate: zone.endDate }, at) &&
        matchesDayAndTime({ daysOfWeek: zone.daysOfWeek, startTime: zone.startTime, endTime: zone.endTime }, at),
    );
    if (active.length === 0) return null;

    const containing = new Set(await zonesContainingPoint(this.prisma, active.map((zone) => zone.id), point));
    return active.find((zone) => containing.has(zone.id)) ?? null;
  }

  async findApplicableSchedule(at: Date) {
    const schedules = await this.prisma.pricingSchedule.findMany({ where: { isActive: true }, orderBy: { priority: 'desc' } });
    for (const schedule of schedules) {
      if (matchesDayAndTime({ daysOfWeek: schedule.daysOfWeek, startTime: schedule.startTime, endTime: schedule.endTime }, at)) {
        return schedule;
      }
    }
    return null;
  }

  async calculate(origin: LatLng, destination: LatLng, at: Date): Promise<PricingBreakdown> {
    const config = await this.prisma.pricingConfiguration.findFirst({ where: { isActive: true } });
    if (!config) throw new NotFoundException('Nenhuma configuração de tarifa ativa. Configure em Tarifas.');

    const { distanceKm, durationMin, source } = await this.distance.calculate(origin, destination);
    const [zone, schedule] = await Promise.all([this.findApplicableZone(origin, at), this.findApplicableSchedule(at)]);

    const baseFare = Number(zone?.baseFare ?? config.baseFare);
    const perKm = Number(zone?.perKm ?? config.perKm);
    const perMinute = Number(zone?.perMinute ?? config.perMinute);
    const minimumFare = Number(zone?.minimumFare ?? config.minimumFare);

    const distanceFare = round2(perKm * distanceKm);
    const timeFare = round2(perMinute * durationMin);
    const subtotal = baseFare + distanceFare + timeFare;

    const zoneMultiplier = zone?.multiplier ? Number(zone.multiplier) : null;
    const scheduleMultiplier = schedule?.multiplier ? Number(schedule.multiplier) : null;

    let finalPrice: number;
    let appliedMultiplier = 1;

    if (config.combinationStrategy === 'ZONE_FIXED_VALUE' && zone?.fixedPrice) {
      finalPrice = Number(zone.fixedPrice);
    } else {
      switch (config.combinationStrategy) {
        case 'MULTIPLY_ALL':
          appliedMultiplier = (zoneMultiplier ?? 1) * (scheduleMultiplier ?? 1);
          break;
        case 'ZONE_PRIORITY':
          appliedMultiplier = zoneMultiplier ?? scheduleMultiplier ?? 1;
          break;
        case 'SCHEDULE_PRIORITY':
          appliedMultiplier = scheduleMultiplier ?? zoneMultiplier ?? 1;
          break;
        default:
          appliedMultiplier = Math.max(zoneMultiplier ?? 1, scheduleMultiplier ?? 1);
      }
      finalPrice = subtotal * appliedMultiplier;
    }

    finalPrice = round2(Math.max(finalPrice, minimumFare));

    return {
      baseFare,
      distanceKm,
      distanceFare,
      durationMin,
      timeFare,
      minimumFare,
      zone: zone ? { id: zone.id, name: zone.name, multiplier: zoneMultiplier, fixedPrice: zone.fixedPrice ? Number(zone.fixedPrice) : null } : null,
      schedule: schedule ? { id: schedule.id, name: schedule.name, multiplier: scheduleMultiplier! } : null,
      combinationStrategy: config.combinationStrategy,
      appliedMultiplier: round2(appliedMultiplier),
      finalPrice,
      distanceSource: source,
    };
  }
}
