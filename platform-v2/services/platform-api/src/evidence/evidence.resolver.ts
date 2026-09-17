import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { EvidenceService } from './evidence.service';
import { EvidenceRecord, EvidenceStatus } from './evidence.types';

@Resolver(() => EvidenceRecord)
export class EvidenceResolver {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Query(() => [EvidenceRecord], { name: 'evidence' })
  listEvidence(
    @Args('municipalityIbge', { nullable: true, type: () => String }) municipalityIbge?: string,
    @Args('sourceCode', { nullable: true, type: () => String }) sourceCode?: string,
    @Args('evidenceType', { nullable: true, type: () => String }) evidenceType?: string,
    @Args('locator', { nullable: true, type: () => String }) locator?: string,
    @Args('status', { nullable: true, type: () => EvidenceStatus }) status?: EvidenceStatus,
    @Args('limit', { nullable: true, type: () => Int }) limit?: number,
  ) {
    return this.evidenceService.list({
      municipalityIbge,
      sourceCode,
      evidenceType,
      locator,
      status,
      limit,
    });
  }

  @Query(() => EvidenceRecord, { name: 'evidenceById', nullable: true })
  getEvidence(@Args('id', { type: () => String }) id: string) {
    return this.evidenceService.findOne(id);
  }
}
