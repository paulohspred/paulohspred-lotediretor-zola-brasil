import { Module } from '@nestjs/common';
import { MaterializationController } from './materialization.controller';
import { MaterializationService } from './materialization.service';
import { TerrainMaterializationController } from './terrain-materialization.controller';
import { TerrainMaterializationService } from './terrain-materialization.service';
import { TerrainProductController } from './terrain-product.controller';
import { TerrainProductService } from './terrain-product.service';

@Module({
  controllers: [
    MaterializationController,
    TerrainMaterializationController,
    TerrainProductController,
  ],
  providers: [MaterializationService, TerrainMaterializationService, TerrainProductService],
})
export class MaterializationModule {}
