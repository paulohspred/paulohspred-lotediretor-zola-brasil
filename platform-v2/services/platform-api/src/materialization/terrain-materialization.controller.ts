import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PropertyMaterializationState } from './materialization.types';
import { TerrainMaterializationService } from './terrain-materialization.service';

function validateLotId(lotId: string): string {
  if (!/^\d{1,20}$/.test(lotId)) {
    throw new BadRequestException('lotId must contain digits only');
  }
  return lotId;
}

@ApiTags('terrain-materialization')
@Controller('api/v1/properties')
export class TerrainMaterializationController {
  constructor(private readonly terrainMaterialization: TerrainMaterializationService) {}

  @Post(':lotId/terrain/materialize')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue idempotent terrain materialization for one lot' })
  @ApiQuery({ name: 'municipalityIbge', required: false, example: '3550308' })
  @ApiQuery({ name: 'force', required: false, type: Boolean })
  @ApiAcceptedResponse({ type: PropertyMaterializationState })
  materialize(
    @Param('lotId') lotId: string,
    @Query('municipalityIbge') municipalityIbge?: string,
    @Query('force') force?: string,
  ) {
    return this.terrainMaterialization.request(
      validateLotId(lotId),
      municipalityIbge || '3550308',
      force === 'true' || force === '1',
    );
  }

  @Get(':lotId/terrain/materialization')
  @ApiOperation({ summary: 'Get latest terrain materialization state for one lot' })
  @ApiQuery({ name: 'municipalityIbge', required: false, example: '3550308' })
  @ApiOkResponse({ type: PropertyMaterializationState })
  status(
    @Param('lotId') lotId: string,
    @Query('municipalityIbge') municipalityIbge?: string,
  ) {
    return this.terrainMaterialization.latest(
      validateLotId(lotId),
      municipalityIbge || '3550308',
    );
  }
}
