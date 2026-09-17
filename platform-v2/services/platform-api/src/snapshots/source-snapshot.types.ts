import { Field, ID, ObjectType } from '@nestjs/graphql';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ObjectType()
export class SourceSnapshotRecord {
  @Field(() => ID)
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Field(() => ID)
  @ApiProperty({ format: 'uuid' })
  sourceRegistryId!: string;

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
  @ApiProperty({ example: 'LOTE_FISCAL' })
  datasetCode!: string;

  @Field()
  @ApiProperty({ example: 'Prefeitura de São Paulo / GeoSampa' })
  authority!: string;

  @Field()
  @ApiProperty({ enum: ['A', 'B', 'C', 'D', 'E', 'F'], example: 'B' })
  accessClass!: string;

  @Field()
  @ApiProperty({ example: 'snapshots/geosampa/lotes/2026-09-17.geojson' })
  objectKey!: string;

  @Field()
  @ApiProperty({ example: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' })
  sha256!: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ example: 'application/geo+json' })
  mediaType?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ example: '1048576', description: 'Byte size as a decimal string.' })
  byteSize?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ format: 'date-time' })
  sourcePublishedAt?: string;

  @Field()
  @ApiProperty({ format: 'date-time' })
  ingestedAt!: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ example: 'geosampa-lote-v1' })
  parserVersion?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ example: 'sha256:...' })
  schemaFingerprint?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ example: '250000', description: 'Feature count as a decimal string.' })
  featureCount?: string;
}
