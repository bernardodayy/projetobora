import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

// Erros do Prisma que aparecem por entrada do usuário (id inexistente, valor
// duplicado, filtro inválido) viravam 500 "Erro interno" — aqui viram o
// status certo, com mensagem que o painel/app consegue mostrar.
function fromPrisma(exception: unknown): { status: number; message: string } | null {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2025') return { status: HttpStatus.NOT_FOUND, message: 'Registro não encontrado' };
    if (exception.code === 'P2002') {
      const target = (exception.meta?.target as string[] | undefined)?.join(', ');
      return { status: HttpStatus.CONFLICT, message: `Já existe um registro com esse valor${target ? ` (${target})` : ''}` };
    }
    if (exception.code === 'P2003') return { status: HttpStatus.BAD_REQUEST, message: 'Registro relacionado não existe' };
  }
  if (exception instanceof Prisma.PrismaClientValidationError) {
    return { status: HttpStatus.BAD_REQUEST, message: 'Parâmetros inválidos' };
  }
  return null;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const mapped = exception instanceof HttpException ? null : fromPrisma(exception);
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : mapped?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;

    // Antes o 500 saía mudo: sem isso não há como saber o que quebrou.
    if (status >= 500) {
      const request = ctx.getRequest<{ method: string; url: string }>();
      this.logger.error(`${request.method} ${request.url}`, exception instanceof Error ? exception.stack : String(exception));
    }

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: mapped?.message ?? 'Erro interno do servidor' };

    response.status(status).json(
      typeof body === 'string'
        ? { statusCode: status, message: body }
        : { statusCode: status, ...(body as object) },
    );
  }
}
