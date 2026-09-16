import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const adapter = new FastifyAdapter({
    requestIdHeader: 'x-correlation-id',
    genReqId: () => randomUUID(),
    trustProxy: process.env.TRUST_PROXY === 'true',
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: ['log', 'error', 'warn'],
  });

  app.enableShutdownHooks();
  app.enableCors({ origin: false });

  adapter.getInstance().addHook('onRequest', (request, reply, done) => {
    reply.header('x-correlation-id', request.id);
    done();
  });

  const openApiConfig = new DocumentBuilder()
    .setTitle('LoteDiretor Platform API')
    .setDescription('Versioned API contracts for territorial data, evidence and product modules.')
    .setVersion(process.env.APP_VERSION ?? '0.1.0')
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('api/docs', app, openApiDocument, {
    jsonDocumentUrl: 'api/docs/openapi.json',
  });

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
