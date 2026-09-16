# Runbook — Fundação local v2

## Objetivo

Subir e validar o Data Plane mínimo sem expor serviços na rede externa da VM.

## Núcleo residente

PostgreSQL/PostGIS, Valkey, NATS JetStream, MinIO e Martin. Todas as portas são bindadas em `127.0.0.1`.

```bash
cd platform-v2
sudo docker compose -f infra/docker/compose.yaml --env-file .env.example up -d postgres valkey nats minio martin
sudo docker compose -f infra/docker/compose.yaml --env-file .env.example --profile migrate run --rm migrate-platform
sudo docker compose -f infra/docker/compose.yaml --env-file .env.example --profile bootstrap run --rm minio-init
```

## Smoke

```bash
sudo ./platform-v2/scripts/foundation-smoke.sh
```

## Perfis sob demanda

- `identity`: Keycloak
- `search`: OpenSearch
- `observability`: OTel Collector, Prometheus, Loki, Grafana
- `edge`: Caddy
- `migrate`: migration/seed one-shot
- `bootstrap`: buckets MinIO one-shot

## Portas locais

- PostgreSQL `55432`
- Valkey `56379`
- NATS `54222`; monitor `58222`
- MinIO `59000`; console `59001`
- Martin `53000`
- Keycloak `58080`; management `58081`
- OpenSearch `59200`
- OTLP gRPC `54317`; HTTP `54318`; Prom exporter `58889`
- Prometheus `59090`; Loki `53100`; Grafana `53001`
- Caddy dev `58088`

## Segurança

`.env.example` contém somente placeholders. Ambiente compartilhado/staging/produção deve usar secret references/vault. OpenSearch com security plugin desligado é **somente desenvolvimento local**.

## Rollback

Parar sem apagar dados:

```bash
sudo docker compose -f platform-v2/infra/docker/compose.yaml stop
```

Destruir ambiente de desenvolvimento, incluindo volumes (ação destrutiva):

```bash
sudo docker compose -f platform-v2/infra/docker/compose.yaml down -v
```
