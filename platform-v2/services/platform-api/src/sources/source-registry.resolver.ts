import { Args, Query, Resolver } from '@nestjs/graphql';
import { SourceRegistryService } from './source-registry.service';
import { SourceRegistryEntry } from './source-registry.types';

@Resolver(() => SourceRegistryEntry)
export class SourceRegistryResolver {
  constructor(private readonly sources: SourceRegistryService) {}

  @Query(() => [SourceRegistryEntry], { name: 'sources' })
  listSources(
    @Args('municipalityIbge', { nullable: true, type: () => String }) municipalityIbge?: string,
  ) {
    return this.sources.list(municipalityIbge);
  }

  @Query(() => SourceRegistryEntry, { name: 'source', nullable: true })
  getSource(
    @Args('sourceCode', { type: () => String }) sourceCode: string,
    @Args('municipalityIbge', { nullable: true, type: () => String }) municipalityIbge?: string,
  ) {
    return this.sources.findOne(sourceCode, municipalityIbge);
  }
}
