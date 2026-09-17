import { Module } from '@nestjs/common';
import { EvidenceController } from './evidence.controller';
import { EvidenceResolver } from './evidence.resolver';
import { EvidenceService } from './evidence.service';

@Module({
  controllers: [EvidenceController],
  providers: [EvidenceResolver, EvidenceService],
})
export class EvidenceModule {}
