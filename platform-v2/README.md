# LoteDiretor Brasil Platform v2

Área de construção da arquitetura definitiva descrita na Seção 32 do Blueprint Final v2.0.

Durante a migração, o ZoLa Brasil na raiz continua operacional. Quando `client-web` atingir paridade funcional de São Paulo, esta árvore será promovida para a estrutura principal do produto e o legacy será arquivado.

## Estrutura

- `apps/` — site, cliente e Admin Next.js
- `services/` — Platform API, Control API, AI Gateway, Solar e A.I TEC
- `workers/` — pipelines de dados, geo, documentos, IA, relatórios e solvers
- `packages/` — UI, tokens, contracts, auth, maps, domain types, observability e testing
- `db/` — migrations Data Plane/Control Plane, views MVT e seeds de teste
- `data/` — dbt e schemas de datasets externos
- `infra/` — Docker, Terraform, Caddy, observability e runbooks
- `tests/` — e2e, integration, security e AI evals
