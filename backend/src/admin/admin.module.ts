import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [ModerationModule],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
