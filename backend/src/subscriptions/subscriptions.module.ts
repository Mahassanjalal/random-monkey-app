import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { EntitlementsService } from './entitlements.service';

@Module({
  providers: [SubscriptionsService, EntitlementsService],
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService, EntitlementsService],
})
export class SubscriptionsModule {}
