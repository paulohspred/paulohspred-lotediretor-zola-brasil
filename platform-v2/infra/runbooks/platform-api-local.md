# Runbook — Platform API local

## Subir

```bash
sudo docker compose -f platform-v2/infra/docker/compose.yaml --env-file platform-v2/.env.example up -d --build platform-api
```

## Validar

```bash
sudo ./platform-v2/scripts/platform-api-smoke.sh
```

## Endpoints

- `GET http://127.0.0.1:54000/api/v1/health`
- `GET http://127.0.0.1:54000/api/v1/sources?municipalityIbge=3550308`
- `POST http://127.0.0.1:54000/graphql`
- `GET http://127.0.0.1:54000/api/docs`
- `GET http://127.0.0.1:54000/api/docs/openapi.json`

A API usa PostgreSQL/PostGIS por `DATABASE_URL`. O frontend não acessa o banco diretamente.

## Contratos versionados

Com a API em execução:

```bash
sudo ./platform-v2/scripts/export-contracts.sh
```

Artefatos gerados:

- `packages/contracts/openapi/platform-api.v1.json`
- `packages/contracts/graphql/platform-api.graphql`

O CI regenera ambos e falha se houver mudança de contrato não versionada.
