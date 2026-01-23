import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  try {
    const app = await NestFactory.create(AppModule);
    const configService = app.get(ConfigService);
    app.use(helmet());

    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    app.enableCors();

    app.setGlobalPrefix('api');

    const port = +configService.get<string>('API_PORT')!;
    await app.listen(port);
    logger.log(`Application is running on: http://localhost:${port}/api`);
  } catch (error) {
    logger.error('Failed to start application', error.stack.split('\n'));
    process.exit(1);
  }
}
bootstrap();
