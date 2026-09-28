export type ZoneShape = 'POLYGON' | 'CIRCLE';

export interface ZonePoint {
  lat: number;
  lng: number;
}

export interface ZoneGeometry {
  points?: ZonePoint[];
  center?: ZonePoint;
  radiusMeters?: number;
}

export interface PricingZone {
  id: string;
  name: string;
  shape: ZoneShape;
  geometry: ZoneGeometry;
  multiplier: string | null;
  fixedPrice: string | null;
  minimumFare: string | null;
  perKm: string | null;
  perMinute: string | null;
  baseFare: string | null;
  priority: number;
  daysOfWeek: number[];
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
}
