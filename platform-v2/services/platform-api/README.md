# platform-api

Platform API da arquitetura v2: NestJS + Fastify + Mercurius.

Primeiro contrato executável:

- `GET /api/v1/health`
- `GET /api/v1/sources?municipalityIbge=3550308`
- `GET /api/v1/sources/:sourceCode`
- `POST /graphql`
- `GET /api/docs`
- `GET /api/docs/openapi.json`

O serviço lê `core.source_registry` e `core.source_endpoint` no PostgreSQL/PostGIS. Nenhum frontend acessa o banco diretamente.
