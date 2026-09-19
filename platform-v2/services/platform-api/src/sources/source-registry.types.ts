import { Field, ID, ObjectType } from '@nestjs/graphql';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ObjectType()
export class SourceEndpoint {
  @Field()
  @ApiProperty({ example: 'WFS' })
  type!: string;

  @Field()
  @ApiProperty({ format: 'uri' })
  url!: string;

  @Field()
  @ApiProperty({ example: 'GET' })
  method!: string;
}

@ObjectType()
export class SourceRegistryEntry {
  @Field(() => ID)
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ example: '3550308' })
  municipalityIbge?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ example: 'São Paulo' })
  municipalityName?: string;

  @Field()
  @ApiProperty({ example: 'PMSP_GEOSAMPA_LOTES' })
  sourceCode!: string;

  @Field()
  @ApiProperty({ example: 'WFS' })
  sourceType!: string;

  @Field()
  @ApiProperty({ example: 'Prefeitura de São Paulo / GeoSampa' })
  authority!: string;

  @Field()
  @ApiProperty({ example: 'LOTE_FISCAL' })
  datasetCode!: string;

  @Field()
  @ApiProperty({ enum: ['A', 'B', 'C', 'D', 'E', 'F'], example: 'B' })
  accessClass!: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ example: 'geosampa-lote-v1' })
  parserVersion?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ example: 'diária/semanal' })
  cadence?: string;

  @Field()
  @ApiProperty({ enum: ['healthy', 'degraded', 'broken', 'manual', 'disabled'] })
  ingestionStatus!: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ format: 'date-time' })
  lastCheckedAt?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ format: 'date-time' })
  lastSuccessAt?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ example: 691200 })
  staleAfterSeconds?: number;

  @Field()
  @ApiProperty({ example: false })
  isStale!: boolean;

  @Field({ nullable: true })
  @ApiPropertyOptional({ example: 'HTTP 503' })
  healthError?: string;

  @Field(() => [SourceEndpoint])
  @ApiProperty({ type: () => [SourceEndpoint] })
  endpoints!: SourceEndpoint[];
}
