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
import { MaterializationService } from './materialization.service';
import { PropertyMaterializationState } from './materialization.types';

function validateLotId(lotId: string): string {
  if (!/^\d{1,20}$/.test(lotId)) {
    throw new BadRequestException('lotId must contain digits only');
  }
  return lotId;
}

@ApiTags('property-materialization')
@Controller('api/v1/properties')
export class MaterializationController {
  constructor(private readonly materialization: MaterializationService) {}

  @Post(':lotId/materialize')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue idempotent evidence materialization for one lot' })
  @ApiQuery({ name: 'municipalityIbge', required: false, example: '3550308' })
  @ApiQuery({ name: 'force', required: false, type: Boolean })
  @ApiAcceptedResponse({ type: PropertyMaterializationState })
  materialize(
    @Param('lotId') lotId: string,
    @Query('municipalityIbge') municipalityIbge?: string,
    @Query('force') force?: string,
  ) {
    return this.materialization.request(
      validateLotId(lotId),
      municipalityIbge || '3550308',
      force === 'true' || force === '1',
    );
  }

  @Get(':lotId/materialization')
  @ApiOperation({ summary: 'Get latest evidence materialization state for one lot' })
  @ApiQuery({ name: 'municipalityIbge', required: false, example: '3550308' })
  @ApiOkResponse({ type: PropertyMaterializationState })
  status(
    @Param('lotId') lotId: string,
    @Query('municipalityIbge') municipalityIbge?: string,
  ) {
    return this.materialization.latest(
      validateLotId(lotId),
      municipalityIbge || '3550308',
    );
  }
}
