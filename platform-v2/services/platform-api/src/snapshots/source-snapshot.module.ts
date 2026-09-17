import { Module } from '@nestjs/common';
import { SourceSnapshotController } from './source-snapshot.controller';
import { SourceSnapshotResolver } from './source-snapshot.resolver';
import { SourceSnapshotService } from './source-snapshot.service';

@Module({
  controllers: [SourceSnapshotController],
  providers: [SourceSnapshotResolver, SourceSnapshotService],
})
export class SourceSnapshotModule {}
