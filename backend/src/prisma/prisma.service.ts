import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { logger } from '../common/logger';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? [{ emit: 'stdout', level: 'query' as const }]
          : [],
    });
  }

  async onModuleInit() {
    await this.$connect();
    logger.info('prisma connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
