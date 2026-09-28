import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';

// Lista paginada: o corpo da resposta continua sendo o array de sempre (quem já consome a lista
// não muda nada) e o total vai no cabeçalho X-Total-Count. Os services devolvem `Page`;
// PaginationInterceptor desembrulha.
export class Page<T> {
  constructor(
    readonly items: T[],
    readonly total: number,
  ) {}
}

const DEFAULT_PAGE_SIZE = 200; // o teto antigo das listas: sem `pageSize` nada muda para quem já usa
const MAX_PAGE_SIZE = 1000;

const toInt = (value?: string) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// `page` e `pageSize` vêm da query string (texto, possivelmente lixo): valor inválido cai no padrão.
export function paging(page?: string, pageSize?: string, defaultSize = DEFAULT_PAGE_SIZE) {
  const take = Math.min(toInt(pageSize) ?? defaultSize, MAX_PAGE_SIZE);
  return { take, skip: ((toInt(page) ?? 1) - 1) * take };
}

@Injectable()
export class PaginationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((data) => {
        if (!(data instanceof Page)) return data;
        context.switchToHttp().getResponse().setHeader('X-Total-Count', String(data.total));
        return data.items;
      }),
    );
  }
}
