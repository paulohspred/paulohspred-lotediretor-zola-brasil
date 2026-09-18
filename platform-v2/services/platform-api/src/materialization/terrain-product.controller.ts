import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TerrainProductService } from './terrain-product.service';

function validateLotId(lotId: string): string {
  if (!/^\d{1,20}$/.test(lotId)) {
    throw new BadRequestException('lotId must contain digits only');
  }
  return lotId;
}

@ApiTags('terrain-materialization')
@Controller('api/v1/properties')
export class TerrainProductController {
  constructor(private readonly terrainProduct: TerrainProductService) {}

  @Get(':lotId/terrain/product')
  @ApiOperation({ summary: 'Get the latest versioned terrain surface product for one lot' })
  @ApiQuery({ name: 'municipalityIbge', required: false, example: '3550308' })
  @ApiQuery({
    name: 'contourIntervalM',
    required: false,
    enum: [0.5, 1, 2, 5],
    example: 1,
  })
  @ApiOkResponse({
    schema: { type: 'object', additionalProperties: true },
  })
  async product(
    @Param('lotId') lotId: string,
    @Query('municipalityIbge') municipalityIbge?: string,
    @Query('contourIntervalM') contourIntervalM?: string,
  ) {
    const interval = contourIntervalM == null ? 1 : Number(contourIntervalM);
    if (![0.5, 1, 2, 5].includes(interval)) {
      throw new BadRequestException(
        'contourIntervalM must be one of 0.5, 1, 2 or 5',
      );
    }
    return this.terrainProduct.getProduct(
      validateLotId(lotId),
      municipalityIbge || '3550308',
      interval,
    );
  }
}
