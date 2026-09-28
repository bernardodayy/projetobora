interface Point {
  label: string;
  value: number;
}

// ponytail: SVG feito à mão para um gráfico de barras simples — evita puxar
// uma lib de charts (recharts etc.) só para isto. Trocar se precisarmos de
// zoom/tooltip/série múltipla de verdade.
export function SimpleBarChart({ data, formatValue }: { data: Point[]; formatValue?: (v: number) => string }) {
  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-muted">Sem dados no período selecionado.</p>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const width = 700;
  const height = 220;
  const barGap = 8;
  const barWidth = Math.max((width - barGap * (data.length - 1)) / data.length, 4);

  return (
    <svg viewBox={`0 0 ${width} ${height + 30}`} className="w-full" role="img" aria-label="Gráfico de barras">
      {data.map((d, i) => {
        const barHeight = (d.value / max) * height;
        const x = i * (barWidth + barGap);
        const y = height - barHeight;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barWidth} height={barHeight} rx={3} className="fill-brand" opacity={0.85}>
              <title>
                {d.label}: {formatValue ? formatValue(d.value) : d.value}
              </title>
            </rect>
            <text x={x + barWidth / 2} y={height + 16} textAnchor="middle" className="fill-current text-[9px] text-muted">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
