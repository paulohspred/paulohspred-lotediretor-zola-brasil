import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const MATERIALIZATION_STATUSES = [
  'UNREQUESTED',
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
] as const;

export type MaterializationStatus = (typeof MATERIALIZATION_STATUSES)[number];

export class PropertyMaterializationState {
  @ApiPropertyOptional({ format: 'uuid' })
  jobId?: string;

  @ApiProperty({ example: '3550308' })
  municipalityIbge!: string;

  @ApiProperty({ example: 'SP_LOT' })
  subjectType!: string;

  @ApiProperty({ example: '6492402' })
  subjectId!: string;

  @ApiProperty({ enum: MATERIALIZATION_STATUSES })
  status!: MaterializationStatus;

  @ApiProperty({ example: 0 })
  attemptCount!: number;

  @ApiProperty({ example: 3 })
  maxAttempts!: number;

  @ApiProperty({ example: 15 })
  evidenceCount!: number;

  @ApiPropertyOptional({ format: 'date-time' })
  requestedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  startedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  finishedAt?: string;

  @ApiPropertyOptional()
  lastError?: string;
}
