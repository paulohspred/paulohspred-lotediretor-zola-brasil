# Docker — fundação local v2

O stack local é deliberadamente dividido por perfis para caber em máquinas de desenvolvimento e não competir com o ZoLa legado.

## Núcleo leve

```bash
cd platform-v2
cp .env.example .env
sudo docker compose -f infra/docker/compose.yaml up -d postgres valkey nats minio
sudo docker compose -f infra/docker/compose.yaml --profile migrate run --rm migrate-platform
sudo docker compose -f infra/docker/compose.yaml up -d martin
```

## Perfis opcionais

```bash
sudo docker compose -f infra/docker/compose.yaml --profile identity up -d keycloak
sudo docker compose -f infra/docker/compose.yaml --profile search up -d opensearch
sudo docker compose -f infra/docker/compose.yaml --profile observability up -d otel-collector prometheus loki grafana
```

Todas as portas são bindadas em `127.0.0.1` por padrão. Os valores de `.env.example` são somente desenvolvimento e devem ser substituídos em qualquer ambiente compartilhado.
