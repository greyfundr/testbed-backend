import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import {
  ClassSerializerInterceptor,
  Logger,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { LoggingInterceptor } from './common/interceptors';
import { Logger as AppLogger } from 'nestjs-pino';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule, {
      rawBody: true,
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
    app.setGlobalPrefix('api', {
      exclude: [
        { path: 'l/:shortCode', method: RequestMethod.GET },
        // Champion / amplifier landing page — public, no API prefix.
        // Hit by champion referral URLs (e.g. dev.greyfundr.com/c/:slug
        // ?ref=CODE). Visitors land here from shared links and can
        // donate via Paystack inline; the donation is attributed back
        // to the referring champion via the ref query.
        { path: 'c/:slug', method: RequestMethod.GET },
        // Init endpoint the static champion page calls before opening
        // PaystackPop — pre-creates the PENDING Transaction and a
        // guest User so the post-payment verify call has something
        // to finalize. Public + no API prefix to match the page itself.
        { path: 'c/:slug/init-donation', method: RequestMethod.POST },
        {
          path: '.well-known/apple-app-site-association',
          method: RequestMethod.GET,
        },
        { path: '.well-known/assetlinks.json', method: RequestMethod.GET },
      ],
    });

    // app.useLogger(app.get(AppLogger));

    // Versioning
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    // const allowedOrigins = configService
    //   .get<string>('ALLOWED_ORIGINS')
    //   ?.split(',') || ['http://localhost:6500'];
    app.enableCors({
      // origin: allowedOrigins,
      origin: true,
      // credentials: true,
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

    app.useGlobalInterceptors(
      new ClassSerializerInterceptor(app.get(Reflector)),
      new LoggingInterceptor(),
    );

    const port = configService.get<number>('PORT') || 8080;
    // Swagger documentation (disable in production)
    const nodeEnv = configService.get<string>('NODE_ENV');
    if (nodeEnv !== 'production') {
      const config = new DocumentBuilder()
        .setTitle('Grey Fundr API Documentation')
        .setDescription('API for Grey Fundr platform')
        .setVersion('1.0')
        .addBearerAuth(
          {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Enter JWT token',
            in: 'header',
          },
          'JWT-auth',
        )
        .addSecurityRequirements('JWT-auth')
        .setExternalDoc('Postman Collection', '/api-json')
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

    await app.listen(Number(port), '0.0.0.0');

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
