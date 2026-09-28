import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { haversineDistanceKm, round2, type LatLng } from './geometry.util';

interface DistanceResult {
  distanceKm: number;
  durationMin: number;
  source: 'google' | 'estimated';
}

// ponytail: sem chave do Google Maps, estima por linha reta × fator de
// sinuosidade de ruas e velocidade média urbana. Trocar por Directions/
// Distance Matrix API quando GOOGLE_MAPS_API_KEY estiver configurada — o
// restante do motor de tarifas não muda.
const STRAIGHT_LINE_CORRECTION = 1.3;
const AVERAGE_SPEED_KMH = 25;

@Injectable()
export class DistanceService {
  private readonly logger = new Logger(DistanceService.name);

  constructor(private readonly config: ConfigService) {}

  async calculate(origin: LatLng, destination: LatLng): Promise<DistanceResult> {
    const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    if (apiKey) {
      try {
        return await this.viaGoogle(origin, destination, apiKey);
      } catch (error) {
        this.logger.warn(`Falha ao consultar Google Distance Matrix, usando estimativa: ${error}`);
      }
    }
    return this.estimate(origin, destination);
  }

  private async viaGoogle(origin: LatLng, destination: LatLng, apiKey: string): Promise<DistanceResult> {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', `${origin.lat},${origin.lng}`);
    url.searchParams.set('destinations', `${destination.lat},${destination.lng}`);
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString());
    const data = (await response.json()) as any;
    const element = data?.rows?.[0]?.elements?.[0];
    if (element?.status !== 'OK') throw new Error(`Distance Matrix retornou status ${element?.status}`);

    return {
      distanceKm: round2(element.distance.value / 1000),
      durationMin: round2(element.duration.value / 60),
      source: 'google',
    };
  }

  private estimate(origin: LatLng, destination: LatLng): DistanceResult {
    const distanceKm = round2(haversineDistanceKm(origin, destination) * STRAIGHT_LINE_CORRECTION);
    const durationMin = round2((distanceKm / AVERAGE_SPEED_KMH) * 60);
    return { distanceKm, durationMin, source: 'estimated' };
  }
}
