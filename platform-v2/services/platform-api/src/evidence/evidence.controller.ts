import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { EvidenceService } from './evidence.service';
import { EvidenceRecord, EvidenceStatus } from './evidence.types';

@ApiTags('evidence')
@Controller('api/v1/evidence')
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Get()
  @ApiOperation({ summary: 'List evidence with source, citation, quality, and provenance context' })
  @ApiQuery({ name: 'municipalityIbge', required: false, example: '3550308' })
  @ApiQuery({ name: 'sourceCode', required: false, example: 'PMSP_GEOSAMPA_LOTES' })
  @ApiQuery({ name: 'evidenceType', required: false, example: 'ZONEAMENTO' })
  @ApiQuery({ name: 'subjectType', required: false, example: 'SP_LOT' })
  @ApiQuery({ name: 'subjectId', required: false, example: '123456789' })
  @ApiQuery({ name: 'locator', required: false, example: 'SQL:001.002.0003-1' })
  @ApiQuery({ name: 'status', required: false, enum: EvidenceStatus })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
  @ApiOkResponse({ description: 'Evidence records', type: EvidenceRecord, isArray: true })
  list(
    @Query('municipalityIbge') municipalityIbge?: string,
    @Query('sourceCode') sourceCode?: string,
    @Query('evidenceType') evidenceType?: string,
    @Query('subjectType') subjectType?: string,
    @Query('subjectId') subjectId?: string,
    @Query('locator') locator?: string,
    @Query('status') status?: EvidenceStatus,
    @Query('limit') limit?: string,
  ) {
    return this.evidence.list({
      municipalityIbge,
      sourceCode,
      evidenceType,
      subjectType,
      subjectId,
      locator,
      status,
      limit: limit === undefined ? undefined : Number(limit),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one evidence record with provenance context' })
  @ApiOkResponse({ description: 'Evidence record', type: EvidenceRecord })
  @ApiNotFoundResponse({ description: 'Evidence not found' })
  async get(@Param('id') id: string) {
    const record = await this.evidence.findOne(id);
    if (!record) throw new NotFoundException('Evidence not found');
    return record;
  }
}
