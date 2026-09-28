import { Waypoints } from 'lucide-react';

// A Central tem identidade própria e fixa — a marca configurada (BRAND_* na
// API) é só dos apps do cliente e do motorista e nunca muda o painel.
export const CENTRAL_NAME = 'Central de Controle';

export function BrandMark({ size = 32, iconSize = 16 }: { size?: number; iconSize?: number }) {
  return (
    <div className="flex shrink-0 items-center justify-center rounded-lg bg-brand text-brand-ink" style={{ width: size, height: size }}>
      <Waypoints size={iconSize} />
    </div>
  );
}
