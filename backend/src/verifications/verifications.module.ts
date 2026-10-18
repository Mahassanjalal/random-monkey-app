import { Module } from '@nestjs/common';
import { VerificationsService } from './verifications.service';
import { VerificationsController } from './verifications.controller';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ModerationModule, NotificationsModule],
  providers: [VerificationsService],
  controllers: [VerificationsController],
  exports: [VerificationsService],
})
export class VerificationsModule {}
