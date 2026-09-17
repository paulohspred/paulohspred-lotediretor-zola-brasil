import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SourceSnapshotService } from './source-snapshot.service';
import { SourceSnapshotRecord } from './source-snapshot.types';

@ApiTags('source-snapshots')
@Controller('api/v1/source-snapshots')
export class SourceSnapshotController {
  constructor(private readonly snapshots: SourceSnapshotService) {}

  @Get()
  @ApiOperation({ summary: 'List immutable source snapshot metadata' })
  @ApiQuery({ name: 'municipalityIbge', required: false, example: '3550308' })
  @ApiQuery({ name: 'sourceCode', required: false, example: 'PMSP_GEOSAMPA_LOTES' })
  @ApiQuery({ name: 'sha256', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
  @ApiOkResponse({ description: 'Source snapshots', type: SourceSnapshotRecord, isArray: true })
  list(
    @Query('municipalityIbge') municipalityIbge?: string,
    @Query('sourceCode') sourceCode?: string,
    @Query('sha256') sha256?: string,
    @Query('limit') limit?: string,
  ) {
    return this.snapshots.list({
      municipalityIbge,
      sourceCode,
      sha256,
      limit: limit === undefined ? undefined : Number(limit),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one immutable source snapshot metadata record' })
  @ApiOkResponse({ description: 'Source snapshot', type: SourceSnapshotRecord })
  @ApiNotFoundResponse({ description: 'Source snapshot not found' })
  async get(@Param('id') id: string) {
    const snapshot = await this.snapshots.findOne(id);
    if (!snapshot) throw new NotFoundException('Source snapshot not found');
    return snapshot;
  }
}
