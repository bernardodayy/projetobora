import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { StripSecretsInterceptor } from './common/strip-secrets.interceptor';
import { PaginationInterceptor } from './common/pagination';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // O .env.example traz um segredo de exemplo: subir em produção com ele deixa qualquer um forjar token de admin.
  if (config.get('NODE_ENV') === 'production' && /troque/i.test(config.get<string>('JWT_ACCESS_SECRET') ?? '')) {
    throw new Error('Defina um JWT_ACCESS_SECRET próprio antes de subir em produção (o valor atual é o de exemplo).');
  }

  const corsOrigin = config.get<string>('CORS_ORIGIN', '');
  app.enableCors({ origin: corsOrigin.split(',').map((origin) => origin.trim()), credentials: true, exposedHeaders: ['X-Total-Count'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  // A ordem importa: o último da lista roda primeiro na volta — PaginationInterceptor desembrulha a
  // página antes de StripSecretsInterceptor limpar o corpo.
  app.useGlobalInterceptors(new StripSecretsInterceptor(), new PaginationInterceptor());
  app.setGlobalPrefix('api');

  const port = config.get('PORT') ?? 3333;
  await app.listen(port);
  console.log(`Central de Controle API rodando em http://localhost:${port}/api`);
}

bootstrap();
