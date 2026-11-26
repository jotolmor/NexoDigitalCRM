import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { jwtSecret } from './auth/jwt-secret';

async function bootstrap() {
  jwtSecret();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  const allowedOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173,http://localhost:8080').split(',').map(origin => origin.trim()).filter(Boolean);
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(Number(process.env.PORT ?? process.env.API_PORT ?? 3000), '0.0.0.0');
}
bootstrap();
