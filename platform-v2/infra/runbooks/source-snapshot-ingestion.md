# Source Snapshot ingestion

## Objetivo

Capturar bytes de uma fonte registrada em `core.source_registry`, armazená-los de forma content-addressed no MinIO e registrar a captura em `core.source_snapshot`.

A escrita é executada por worker/CLI. Não existe endpoint HTTP público para criação de snapshots.

## Pré-requisitos locais

```sh
docker compose -f platform-v2/infra/docker/compose.yaml --env-file platform-v2/.env.example up -d postgres minio
docker compose -f platform-v2/infra/docker/compose.yaml --env-file platform-v2/.env.example --profile migrate run --rm migrate-platform
docker compose -f platform-v2/infra/docker/compose.yaml --env-file platform-v2/.env.example --profile bootstrap run --rm minio-init
```

## Ingerir uma fonte GET

```sh
docker compose -f platform-v2/infra/docker/compose.yaml --env-file platform-v2/.env.example \
  --profile ingest run --rm data-pipelines \
  --source-code PMSP_LEGISLACAO_LPUOS --municipality-ibge 3550308
```

O worker retorna JSON com `snapshotId`, `created`, `objectCreated`, `objectKey`, `sha256`, `byteSize` e `mediaType`.

## Idempotência

A chave do objeto é `raw/<sourceCode>/<sha256>`. Antes do upload o worker verifica se a chave já existe. No banco, `UNIQUE (source_registry_id, sha256)` e `ON CONFLICT DO NOTHING` impedem duplicação lógica. Reprocessar bytes idênticos retorna o `snapshotId` existente.

## Limites de segurança

- somente endpoints habilitados e método `GET`;
- timeout padrão: 30 s (`--timeout-ms` para override explícito);
- limite padrão: 50 MiB (`--max-bytes` para override explícito);
- endpoints `POST`, autenticação, paginação/WFS parametrizado e downloads compostos exigem conectores específicos;
- o worker não interpreta conteúdo nem gera evidência; parsing/evidence é uma etapa posterior;
- a chave content-addressed evita sobrescrita pela aplicação, mas o bucket de desenvolvimento ainda não é WORM/Object Lock. Retenção imutável de produção deve ser configurada antes de staging/produção.

## Validação

```sh
sudo ./platform-v2/scripts/source-snapshot-ingest-smoke.sh
```

O smoke usa uma fonte temporária isolada, ingere duas vezes, exige um único snapshot, verifica SHA-256 e objeto MinIO e remove os dados de teste.

## Rollback

Código: reverter o commit do worker/compose. Dados: snapshots reais são artefatos de auditoria e não devem ser apagados como parte de rollback de aplicação. Em ambiente de desenvolvimento, remoção deve ser deliberada e coordenada entre `core.source_snapshot` e o objeto MinIO correspondente.
