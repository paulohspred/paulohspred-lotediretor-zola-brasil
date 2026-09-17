import { Field, Float, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum EvidenceStatus {
  CONFIRMADO = 'CONFIRMADO',
  CALCULADO = 'CALCULADO',
  INFERIDO = 'INFERIDO',
  PENDENTE = 'PENDENTE',
  CONFLITANTE = 'CONFLITANTE',
  NAO_DISPONIVEL = 'NAO_DISPONIVEL',
}

registerEnumType(EvidenceStatus, { name: 'EvidenceStatus' });

export const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, string> = {
  [EvidenceStatus.CONFIRMADO]: 'Confirmado',
  [EvidenceStatus.CALCULADO]: 'Calculado',
  [EvidenceStatus.INFERIDO]: 'Inferido',
  [EvidenceStatus.PENDENTE]: 'Pendente',
  [EvidenceStatus.CONFLITANTE]: 'Conflitante',
  [EvidenceStatus.NAO_DISPONIVEL]: 'Não disponível',
};

@ObjectType()
export class EvidenceSnapshot {
  @Field(() => ID)
  @ApiProperty({ format: 'uuid' })
  id!: string;

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
  @ApiProperty({ example: 'snapshots/geosampa/lotes/2026-09-17.geojson' })
  objectKey!: string;

  @Field()
  @ApiProperty({ example: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' })
  sha256!: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ format: 'date-time' })
  sourcePublishedAt?: string;

  @Field()
  @ApiProperty({ format: 'date-time' })
  ingestedAt!: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ example: 'geosampa-lote-v1' })
  parserVersion?: string;
}

@ObjectType()
export class EvidenceCitation {
  @Field(() => ID)
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ format: 'uri' })
  sourceUrl?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional()
  documentTitle?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional()
  sourceLocator?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional()
  quotedText?: string;
}

@ObjectType()
export class EvidenceQualityAssessment {
  @Field(() => ID)
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Field({ nullable: true })
  @ApiPropertyOptional()
  geometryQuality?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional()
  temporalQuality?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional()
  sourceQuality?: string;

  @Field(() => Float, { nullable: true })
  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  confidence?: number;

  @Field({ nullable: true })
  @ApiPropertyOptional()
  notes?: string;

  @Field()
  @ApiProperty({ format: 'date-time' })
  assessedAt!: string;
}

@ObjectType()
export class EvidenceProvenanceLink {
  @Field(() => ID)
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Field()
  @ApiProperty({ example: 'DERIVED_FROM' })
  relationType!: string;

  @Field(() => ID, { nullable: true })
  @ApiPropertyOptional({ format: 'uuid' })
  parentEvidenceId?: string;
}

@ObjectType()
export class EvidenceRecord {
  @Field(() => ID)
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @Field()
  @ApiProperty({ example: 'ZONEAMENTO' })
  evidenceType!: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ example: 'SQL:001.002.0003-1' })
  locator?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional()
  valueText?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ example: 'm²' })
  unit?: string;

  @Field(() => EvidenceStatus)
  @ApiProperty({ enum: EvidenceStatus })
  status!: EvidenceStatus;

  @Field()
  @ApiProperty({ example: 'Confirmado' })
  statusLabel!: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ format: 'date-time' })
  validFrom?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional({ format: 'date-time' })
  validTo?: string;

  @Field()
  @ApiProperty({ format: 'date-time' })
  recordedAt!: string;

  @Field({ nullable: true })
  @ApiPropertyOptional()
  calculationMethod?: string;

  @Field({ nullable: true })
  @ApiPropertyOptional()
  parserVersion?: string;

  @Field(() => EvidenceSnapshot)
  @ApiProperty({ type: () => EvidenceSnapshot })
  snapshot!: EvidenceSnapshot;

  @Field(() => [EvidenceCitation])
  @ApiProperty({ type: () => [EvidenceCitation] })
  citations!: EvidenceCitation[];

  @Field(() => EvidenceQualityAssessment, { nullable: true })
  @ApiPropertyOptional({ type: () => EvidenceQualityAssessment })
  qualityAssessment?: EvidenceQualityAssessment;

  @Field(() => [EvidenceProvenanceLink])
  @ApiProperty({ type: () => [EvidenceProvenanceLink] })
  provenance!: EvidenceProvenanceLink[];
}
