import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    const configService = app.get(ConfigService);

    // Security middleware
    app.use(
      helmet({
        contentSecurityPolicy: process.env.NODE_ENV === 'production',
        crossOriginEmbedderPolicy: process.env.NODE_ENV === 'production',
      }),
    );

    // Global prefix should be set before versioning and CORS
    app.setGlobalPrefix('api');

    // Versioning
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    const allowedOrigins = configService
      .get<string>('ALLOWED_ORIGINS')
      ?.split(',') || ['http://localhost:6500'];
    app.enableCors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    const port = configService.get<number>('API_PORT') || 3000;
    // Swagger documentation (disable in production)
    const nodeEnv = configService.get<string>('NODE_ENV');
    if (nodeEnv !== 'production') {
      const config = new DocumentBuilder()
        .setTitle('Grey Fundr API Documentation')
        .setDescription('API for Grey Fundr platform')
        .setVersion('1.0')
        .addServer(`http://localhost:${port}`, 'Local Development Server')
        .addBearerAuth({
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token',
        })
        .addSecurityRequirements('accessToken')
        .build();

      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api/docs', app, document, {
        customSiteTitle: 'Grey Fundr API Docs',
        swaggerOptions: {
          persistAuthorization: true,
          tagsSorter: 'alpha',
        },
      });

      logger.log('Swagger documentation available at /api/docs');
    }

    // Graceful shutdown
    app.enableShutdownHooks();

    await app.listen(port);

    logger.log(`🚀 Application is running on: http://localhost:${port}/api`);
    logger.log(`📝 Environment: ${nodeEnv || 'development'}`);
  } catch (error) {
    logger.error(
      'Failed to start application',
      error instanceof Error ? error.stack : error,
    );
    process.exit(1);
  }
}

bootstrap();
