import { Module } from '@nestjs/common';
import { MaterializationController } from './materialization.controller';
import { MaterializationService } from './materialization.service';
import { TerrainMaterializationController } from './terrain-materialization.controller';
import { TerrainMaterializationService } from './terrain-materialization.service';

@Module({
  controllers: [MaterializationController, TerrainMaterializationController],
  providers: [MaterializationService, TerrainMaterializationService],
})
export class MaterializationModule {}
