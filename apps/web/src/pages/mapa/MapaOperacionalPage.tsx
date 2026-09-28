import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import { MapPinOff } from 'lucide-react';
import { api } from '../../lib/api';
import { useRealtimeEvent } from '../../lib/socket';
import { Card, CardBody } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { AVAILABILITY_LABEL, DriverAvailability, DriverRow } from '../motoristas/types';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

const DEFAULT_CENTER = { lat: -23.5614, lng: -46.6559 }; // ponytail: centro fixo (São Paulo); trocar por geolocalização/config da operação quando existir mais de uma praça

const AVAILABILITY_COLOR: Record<DriverAvailability, string> = {
  AVAILABLE: '#16a34a',
  BUSY: '#dc2626',
  EN_ROUTE: '#2563eb',
  WAITING_PASSENGER: '#9333ea',
  OFFLINE: '#6b7280',
};

function markerIcon(color: string) {
  return {
    path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 1.5,
    scale: 1.6,
    anchor: typeof google !== 'undefined' ? new google.maps.Point(12, 22) : undefined,
  };
}

export function MapaOperacionalPage() {
  const queryClient = useQueryClient();
  const [selectedDriver, setSelectedDriver] = useState<DriverRow | null>(null);
  const [visibleStatuses, setVisibleStatuses] = useState<Set<DriverAvailability>>(
    new Set(['AVAILABLE', 'BUSY', 'EN_ROUTE', 'WAITING_PASSENGER']),
  );

  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: API_KEY ?? '', id: 'central-google-maps' });

  const driversQuery = useQuery<DriverRow[]>({
    queryKey: ['drivers', { status: 'APPROVED' }, 'map'],
    queryFn: () => api.get('/drivers', { params: { status: 'APPROVED', pageSize: 1000 } }).then((r) => r.data),
    refetchInterval: 30_000,
  });

  useRealtimeEvent('driver.updated', () => {
    queryClient.invalidateQueries({ queryKey: ['drivers'] });
  });

  const drivers = useMemo(
    () => (driversQuery.data ?? []).filter((d: any) => d.lastLat && d.lastLng && visibleStatuses.has(d.availability)),
    [driversQuery.data, visibleStatuses],
  );

  function toggleStatus(status: DriverAvailability) {
    setVisibleStatuses((prev) => {
      const next = new Set(prev);
      next.has(status) ? next.delete(status) : next.add(status);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Mapa operacional</h1>
        <p className="text-sm text-muted">Localização em tempo real dos motoristas aprovados.</p>
      </div>

      {!API_KEY ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-20 text-center">
            <MapPinOff className="text-muted" size={28} />
            <p className="text-sm font-medium">Chave do Google Maps não configurada</p>
            <p className="max-w-md text-sm text-muted">
              Defina <code className="rounded bg-surface-hover px-1.5 py-0.5">VITE_GOOGLE_MAPS_API_KEY</code> em{' '}
              <code className="rounded bg-surface-hover px-1.5 py-0.5">apps/web/.env</code> com uma chave da Maps
              JavaScript API para habilitar o mapa. Nenhum dado é simulado enquanto isso.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
          <Card className="overflow-hidden">
            {isLoaded ? (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '560px' }}
                center={DEFAULT_CENTER}
                zoom={12}
                onClick={() => setSelectedDriver(null)}
                options={{ streetViewControl: false, mapTypeControl: false }}
              >
                {drivers.map((driver: any) => (
                  <MarkerF
                    key={driver.id}
                    position={{ lat: Number(driver.lastLat), lng: Number(driver.lastLng) }}
                    icon={markerIcon(AVAILABILITY_COLOR[driver.availability as DriverAvailability])}
                    onClick={() => setSelectedDriver(driver)}
                  />
                ))}
              </GoogleMap>
            ) : (
              <div className="flex h-[560px] items-center justify-center text-sm text-muted">Carregando mapa…</div>
            )}
          </Card>

          <div className="flex flex-col gap-4">
            <Card>
              <CardBody>
                <p className="mb-3 text-sm font-medium">Filtrar por status</p>
                <div className="flex flex-col gap-2">
                  {(Object.keys(AVAILABILITY_COLOR) as DriverAvailability[])
                    .filter((s) => s !== 'OFFLINE')
                    .map((status) => (
                      <label key={status} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={visibleStatuses.has(status)} onChange={() => toggleStatus(status)} />
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AVAILABILITY_COLOR[status] }} />
                        {AVAILABILITY_LABEL[status]}
                      </label>
                    ))}
                </div>
                <p className="mt-3 text-xs text-muted">{drivers.length} motorista(s) visível(is) no mapa</p>
              </CardBody>
            </Card>

            {selectedDriver && (
              <Card>
                <CardBody>
                  <p className="mb-1 text-sm font-medium">{selectedDriver.name}</p>
                  <Badge tone="brand">{AVAILABILITY_LABEL[selectedDriver.availability]}</Badge>
                  <dl className="mt-3 flex flex-col gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted">Veículo</dt>
                      <dd>{selectedDriver.vehicles[0] ? `${selectedDriver.vehicles[0].plate} · ${selectedDriver.vehicles[0].model}` : '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Avaliação</dt>
                      <dd>{selectedDriver.rating ?? '—'}</dd>
                    </div>
                  </dl>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
