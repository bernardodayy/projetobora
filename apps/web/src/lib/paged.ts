import { useState } from 'react';
import { api } from './api';

export const PAGE_SIZE = 25;

export interface Paged<T> {
  items: T[];
  total: number;
}

// A API devolve o array de sempre e o total no cabeçalho X-Total-Count.
export async function fetchPage<T>(url: string, params: Record<string, unknown>, page: number, pageSize = PAGE_SIZE): Promise<Paged<T>> {
  const res = await api.get<T[]>(url, { params: { ...params, page, pageSize } });
  return { items: res.data, total: Number(res.headers['x-total-count'] ?? res.data.length) };
}

// Para exportar CSV: percorre todas as páginas do filtro, e não só a que está na tela.
// ponytail: teto de 5.000 linhas — passando disso, filtrar por período antes de exportar.
export async function fetchAll<T>(url: string, params: Record<string, unknown>, max = 5000): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; rows.length < max; page++) {
    const { items, total } = await fetchPage<T>(url, params, page, 500);
    rows.push(...items);
    if (items.length === 0 || rows.length >= total) break;
  }
  return rows.slice(0, max);
}

// Página atual que volta sozinha para a 1ª quando o filtro muda (sem effect: o effect faria uma
// busca com o filtro novo na página antiga antes de corrigir).
export function usePage(filters: unknown): [number, (page: number) => void] {
  const key = JSON.stringify(filters);
  const [state, setState] = useState({ key, page: 1 });
  return [state.key === key ? state.page : 1, (page) => setState({ key, page })];
}
