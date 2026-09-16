import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';

@ApiTags('health')
@Controller('api/v1/health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @ApiOperation({ summary: 'Platform API liveness/readiness status' })
  @ApiOkResponse({
    schema: {
      example: {
        service: 'platform-api',
        status: 'ok',
        database: 'ok',
        version: '0.1.0',
      },
    },
  })
  async health() {
    const databaseHealthy = await this.database.isHealthy();
    return {
      service: 'platform-api',
      status: databaseHealthy ? 'ok' : 'degraded',
      database: databaseHealthy ? 'ok' : 'unavailable',
      version: process.env.APP_VERSION ?? '0.1.0',
    };
  }
}
