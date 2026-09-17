# data-pipelines

Workers de ingestão da plataforma v2.

## Source Snapshot

O primeiro worker executável cria snapshots imutáveis de fontes registradas sem expor escrita pública na Platform API.

Fluxo:

1. resolve `core.source_registry` + um endpoint habilitado;
2. aceita somente endpoint HTTP `GET` nesta etapa;
3. baixa com timeout e limite de bytes;
4. calcula SHA-256 durante o download;
5. grava o artefato no bucket `sources` com chave `raw/<sourceCode>/<sha256>`;
6. registra `core.source_snapshot` com `ON CONFLICT (source_registry_id, sha256) DO NOTHING`;
7. atualiza `last_checked_at` e, quando a fonte fornece `Last-Modified`, `last_source_update`.

Exemplo via Docker Compose:

```sh
docker compose -f platform-v2/infra/docker/compose.yaml --env-file platform-v2/.env.example \
  --profile ingest run --rm data-pipelines \
  --source-code PMSP_LEGISLACAO_LPUOS --municipality-ibge 3550308
```

Parâmetros opcionais: `--endpoint-type`, `--timeout-ms` e `--max-bytes`. Endpoints `POST` são rejeitados até existir um conector específico que conheça seus parâmetros e semântica.
