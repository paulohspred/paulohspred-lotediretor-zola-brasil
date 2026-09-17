import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { MercuriusDriver, MercuriusDriverConfig } from '@nestjs/mercurius';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { EvidenceModule } from './evidence/evidence.module';
import { SourceRegistryModule } from './sources/source-registry.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    EvidenceModule,
    SourceRegistryModule,
    GraphQLModule.forRoot<MercuriusDriverConfig>({
      driver: MercuriusDriver,
      autoSchemaFile: true,
      sortSchema: true,
      path: '/graphql',
      graphiql: process.env.NODE_ENV !== 'production',
    }),
  ],
})
export class AppModule {}
