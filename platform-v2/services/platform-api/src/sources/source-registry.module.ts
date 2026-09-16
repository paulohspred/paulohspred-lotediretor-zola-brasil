import { Module } from '@nestjs/common';
import { SourceRegistryController } from './source-registry.controller';
import { SourceRegistryResolver } from './source-registry.resolver';
import { SourceRegistryService } from './source-registry.service';

@Module({
  controllers: [SourceRegistryController],
  providers: [SourceRegistryService, SourceRegistryResolver],
  exports: [SourceRegistryService],
})
export class SourceRegistryModule {}
