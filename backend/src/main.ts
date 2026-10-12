import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { appConfig } from './config/app.config';
import { logger } from './common/logger';
import { ZodValidationPipe } from './common/zod.pipe';

async function bootstrap() {
  const cfg = appConfig();
  // Fail fast on insecure defaults — required for professional / 1M-user deploys.
  if (!cfg.jwtSecret || cfg.jwtSecret.length < 32) {
    if (cfg.env === 'production') {
      throw new Error('JWT_SECRET must be set to a strong value (>=32 chars) in production');
    }
    logger.warn('JWT_SECRET is weak/default — dev only. Set a strong secret for any shared env.');
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // needed for Stripe webhook signature verification
    logger: {
      log: (m) => logger.info(m),
      error: (m) => logger.error(m),
      warn: (m) => logger.warn(m),
      debug: (m) => logger.debug(m),
      verbose: (m) => logger.trace(m),
      fatal: (m) => logger.fatal(m),
    },
  });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: cfg.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });
  app.useGlobalPipes(new ZodValidationPipe());
  app.enableShutdownHooks();
  await app.listen(cfg.port, '0.0.0.0');
  logger.info({ port: cfg.port, env: cfg.env }, 'api listening');
}

bootstrap().catch((e) => {
  logger.fatal({ err: String(e) }, 'bootstrap failed');
  process.exit(1);
});
