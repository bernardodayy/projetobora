// Exportação client-side simples: os dados já estão carregados na tela (React
// Query), não precisa de endpoint novo nem de gerar o arquivo no servidor.
function escapeCsvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv<T>(filename: string, rows: T[], columns: { header: string; value: (row: T) => unknown }[]) {
  const lines = [
    columns.map((c) => escapeCsvCell(c.header)).join(';'),
    ...rows.map((row) => columns.map((c) => escapeCsvCell(c.value(row))).join(';')),
  ];
  // BOM no início: Excel no Windows não reconhece UTF-8 sem ele e mostra acento quebrado.
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
