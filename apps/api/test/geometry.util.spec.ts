import { haversineDistanceKm, isPointInCircle, isPointInPolygon } from '../src/pricing/geometry.util';

describe('haversineDistanceKm', () => {
  it('returns ~0 for the same point', () => {
    const point = { lat: -23.5505, lng: -46.6333 };
    expect(haversineDistanceKm(point, point)).toBeCloseTo(0, 3);
  });

  it('matches a known distance (São Paulo to Rio de Janeiro, ~360km in a straight line)', () => {
    const saoPaulo = { lat: -23.5505, lng: -46.6333 };
    const rio = { lat: -22.9068, lng: -43.1729 };
    expect(haversineDistanceKm(saoPaulo, rio)).toBeGreaterThan(350);
    expect(haversineDistanceKm(saoPaulo, rio)).toBeLessThan(370);
  });
});

describe('isPointInCircle', () => {
  const center = { lat: -23.5505, lng: -46.6333 };

  it('is true for the center itself', () => {
    expect(isPointInCircle(center, center, 100)).toBe(true);
  });

  it('is true for a point inside the radius', () => {
    expect(isPointInCircle({ lat: -23.551, lng: -46.6333 }, center, 500)).toBe(true);
  });

  it('is false for a point far outside the radius', () => {
    expect(isPointInCircle({ lat: -22.9068, lng: -43.1729 }, center, 500)).toBe(false);
  });
});

describe('isPointInPolygon', () => {
  // Quadrado simples em torno de (0,0)
  const square = [
    { lat: 1, lng: -1 },
    { lat: 1, lng: 1 },
    { lat: -1, lng: 1 },
    { lat: -1, lng: -1 },
  ];

  it('is true for a point inside the polygon', () => {
    expect(isPointInPolygon({ lat: 0, lng: 0 }, square)).toBe(true);
  });

  it('is false for a point outside the polygon', () => {
    expect(isPointInPolygon({ lat: 5, lng: 5 }, square)).toBe(false);
  });

  it('is false for a point just past an edge', () => {
    expect(isPointInPolygon({ lat: 1.1, lng: 0 }, square)).toBe(false);
  });
});
