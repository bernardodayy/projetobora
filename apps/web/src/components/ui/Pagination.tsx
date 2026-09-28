import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm text-muted">
      <span className="whitespace-nowrap">
        {from}–{to} de {total.toLocaleString('pt-BR')}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Página anterior">
            <ChevronLeft size={14} />
          </Button>
          <span className="whitespace-nowrap tabular-nums">
            {page} / {pages}
          </span>
          <Button variant="secondary" onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Próxima página">
            <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}
