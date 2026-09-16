import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SourceRegistryService } from './source-registry.service';
import { SourceRegistryEntry } from './source-registry.types';

@ApiTags('sources')
@Controller('api/v1/sources')
export class SourceRegistryController {
  constructor(private readonly sources: SourceRegistryService) {}

  @Get()
  @ApiOperation({ summary: 'List registered authoritative data sources' })
  @ApiQuery({ name: 'municipalityIbge', required: false, example: '3550308' })
  @ApiOkResponse({ description: 'Source Registry entries', type: SourceRegistryEntry, isArray: true })
  list(@Query('municipalityIbge') municipalityIbge?: string) {
    return this.sources.list(municipalityIbge);
  }

  @Get(':sourceCode')
  @ApiOperation({ summary: 'Get one Source Registry entry' })
  @ApiQuery({ name: 'municipalityIbge', required: false, example: '3550308' })
  @ApiOkResponse({ description: 'Source Registry entry', type: SourceRegistryEntry })
  @ApiNotFoundResponse({ description: 'Source not found' })
  async get(
    @Param('sourceCode') sourceCode: string,
    @Query('municipalityIbge') municipalityIbge?: string,
  ) {
    const source = await this.sources.findOne(sourceCode, municipalityIbge);
    if (!source) throw new NotFoundException('Source not found');
    return source;
  }
}
