import { Module } from '@nestjs/common';
import { AgeAssuranceService } from './age-assurance.service';

@Module({
  providers: [AgeAssuranceService],
  exports: [AgeAssuranceService],
})
export class AgeAssuranceModule {}
