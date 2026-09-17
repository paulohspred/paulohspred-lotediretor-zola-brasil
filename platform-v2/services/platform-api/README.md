# platform-api

Platform API da arquitetura v2: NestJS + Fastify + Mercurius.

Contratos executáveis atuais:

- `GET /api/v1/health`
- `GET /api/v1/sources?municipalityIbge=3550308`
- `GET /api/v1/sources/:sourceCode`
- `GET /api/v1/source-snapshots`
- `GET /api/v1/source-snapshots/:id`
- `GET /api/v1/evidence`
- `GET /api/v1/evidence/:id`
- `POST /graphql`
- `GET /api/docs`
- `GET /api/docs/openapi.json`

Source Registry, Source Snapshot e Evidence são somente leitura nesta etapa. `source-snapshots` expõe metadados imutáveis de captura (hash SHA-256, object key, versão de parser, publicação/ingestão e contagens) sem criar snapshots por HTTP.

A Evidence API é somente leitura nesta etapa. Ela compõe `evidence.evidence` com o snapshot e a fonte de origem, citações, a avaliação de qualidade mais recente e links de proveniência. O status técnico `NAO_DISPONIVEL` é exposto com o rótulo humano `Não disponível`.

Filtros REST disponíveis em `GET /api/v1/evidence`: `municipalityIbge`, `sourceCode`, `evidenceType`, `locator`, `status` e `limit` (1–500). O GraphQL expõe os mesmos filtros em `evidence(...)` e consulta singular em `evidenceById(id:)`.

O serviço lê o PostgreSQL/PostGIS por meio do `DatabaseService`. Nenhum frontend acessa o banco diretamente. A tabela `evidence.conflict` ainda não é agregada ao retorno porque o schema atual não possui vínculo direto entre conflito e evidência; essa relação deve ser modelada antes de ser exposta.
