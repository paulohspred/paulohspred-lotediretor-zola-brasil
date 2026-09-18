import { Module } from '@nestjs/common';
import { MaterializationController } from './materialization.controller';
import { MaterializationService } from './materialization.service';

@Module({
  controllers: [MaterializationController],
  providers: [MaterializationService],
})
export class MaterializationModule {}
