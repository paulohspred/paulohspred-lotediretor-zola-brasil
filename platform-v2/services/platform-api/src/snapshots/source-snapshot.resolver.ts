import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { SourceSnapshotService } from './source-snapshot.service';
import { SourceSnapshotRecord } from './source-snapshot.types';

@Resolver(() => SourceSnapshotRecord)
export class SourceSnapshotResolver {
  constructor(private readonly snapshots: SourceSnapshotService) {}

  @Query(() => [SourceSnapshotRecord], { name: 'sourceSnapshots' })
  listSnapshots(
    @Args('municipalityIbge', { nullable: true, type: () => String }) municipalityIbge?: string,
    @Args('sourceCode', { nullable: true, type: () => String }) sourceCode?: string,
    @Args('sha256', { nullable: true, type: () => String }) sha256?: string,
    @Args('limit', { nullable: true, type: () => Int }) limit?: number,
  ) {
    return this.snapshots.list({ municipalityIbge, sourceCode, sha256, limit });
  }

  @Query(() => SourceSnapshotRecord, { name: 'sourceSnapshot', nullable: true })
  getSnapshot(@Args('id', { type: () => String }) id: string) {
    return this.snapshots.findOne(id);
  }
}
