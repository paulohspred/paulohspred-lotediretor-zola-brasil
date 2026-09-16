# LoteDiretor Brasil — Blueprint v2.0 Implementation Status

Baseline: **Blueprint Final v2.0 (20/08/2026), Seção 32 prevalece**.

## Regra de transição

O ZoLa Brasil atual permanece como aplicação operacional/cidade laboratório enquanto a plataforma v2 é construída em `platform-v2/`. Nenhuma capacidade validada será descartada antes de existir substituto com paridade funcional e teste de regressão. O ZoLa é referência de comportamento e fonte de fixtures; não é a stack web final.

## Estado por etapa do roadmap integrado

| Etapa | Blueprint | Estado atual | Próximo gate |
|---|---|---|---|
| 0 | Fundação | **INICIADA** | monorepo v2, CI/CD, design tokens, Keycloak, Caddy, PostgreSQL/PostGIS, object storage, OTel |
| 1 | Core territorial | **PARCIAL / SP FORTE** | Source Registry persistente, IBGE nacional, evidence lineage, Parcel Resolver genérico, MVT, relatório v1 por API |
| 2 | UX cliente | **PARCIAL / LEGACY ZOLA** | Next.js site/login/client shell e migração progressiva do Explorer/mapa |
| 3 | Imóvel 360 | **NÃO INICIADA** | property/development/explorer/market/CRM/AVM contracts e telas |
| 4 | RE Rural | **NÃO INICIADA** | CAR/SIGEF/SNCR/CIB/IBAMA/INPE + overlaps/monitoring |
| 5 | AI Core | **NÃO INICIADA** | AI Gateway, ingestão, OpenSearch híbrido, A.I Cidades, tools e evals |
| 6 | Condomínio | **NÃO INICIADA** | upload privado, regras/atas, A.I Condomínio, dashboard/relatório |
| 7 | Energia Solar | **NÃO INICIADA** | site/surface, layout, geração, tarifa, financeiro e relatório |
| 8 | A.I TEC | **NÃO INICIADA** | terrain/envelope, site solver, parking, massing, Pareto e exports |
| 9 | Prefeitura | **NÃO INICIADA** | workspace CTM, publicação, tax rules/permits, CIB/SINTER connectors |
| 10 | Admin SaaS | **NÃO INICIADA** | Control Plane, billing Mercado Pago, CMS, support, Data/AI Ops, releases |
| 11 | Escala nacional | **NÃO INICIADA** | factory municipal, contratos de dados, enterprise, HA/DR e otimizações |

## Capacidades já comprovadas na cidade laboratório São Paulo

- lote fiscal GeoSampa por viewport e relatório por lote;
- zoneamento, macrozona, macroárea, eixos, operações urbanas e restrições territoriais;
- LPUOS: CA/TO/TP, gabarito/recuos, PA/Quota Ambiental, Quadro 4 e Quadro 4A;
- SISZON e TPCL/IPTU anual;
- ITBI histórico com referência de cartório/matrícula quando publicada;
- risco, inundação, contaminação, patrimônio e arqueologia;
- entorno: transporte, educação, saúde, parques/cultura e setor censitário;
- camadas interativas, busca, favoritos, comparação, impressão, CSV/GeoJSON;
- edificações 3D oficiais e imagens aéreas históricas WMS;
- testes SP e isolamento explícito dos contratos NYC substituídos.

## Gaps estruturais prioritários

### Fundação / Data Plane
- PostgreSQL/PostGIS v2 com schemas do Blueprint e migrations versionadas.
- `core.source_registry`, endpoint, licença, cobertura, snapshot e health.
- Evidence lineage: source snapshot, hash, parser version, data de consulta/vigência.
- Object storage imutável para artefatos brutos e relatórios.
- Valkey para cache/locks; NATS JetStream para eventos; OpenSearch para busca documental.
- Martin MVT sobre views seguras.
- OTel + Prometheus/Grafana/Loki e correlation IDs.

### Segurança / identidade
- Keycloak OIDC, cookie/BFF, MFA/WebAuthn.
- tenant context no servidor; RLS nas tabelas privadas.
- RBAC/ABAC separado de entitlement, quota e feature flag.
- segredos por referência/vault; nunca bearer principal em localStorage.

### Core territorial nacional
- catálogo mestre IBGE e resolver nacional de município.
- Parcel Resolver genérico por endereço/coordenada/polígono/inscrição/CIB.
- conectores GeoServer/ArcGIS/download reutilizáveis.
- motor jurídico temporal genérico e armazenamento de versões legais.
- API `/api/v1`, GraphQL de composição, MVT e SSE de jobs.
- relatório com status CONFIRMADO/CALCULADO/INFERIDO/PENDENTE/CONFLITANTE/NÃO DISPONÍVEL.

### Produto
- site institucional, login e client shell Next.js.
- migração das funções validadas do ZoLa para MapLibre/deck.gl.
- Imóvel 360, RE Rural, Condomínio, Solar, A.I TEC e Prefeitura.
- AI Core com A.I Cidades/A.I Condomínio/A.I TEC e evals.
- Control Plane Admin + billing/CMS/support/releases.

## Definition of Done obrigatória para cada módulo

1. API contract e schema versionados.
2. Permissões/entitlements definidos.
3. Fontes/licenças/provenance catalogadas.
4. Unit/integration/e2e e falhas cobertas.
5. Metrics/traces/logs/alertas definidos.
6. Runbook/rollback.
7. UX desktop/mobile/acessibilidade.
8. Relatório/evidência quando houver conclusão técnica.
9. Owner, SLO e retenção documentados.
10. Security review e tenant-isolation test para dados privados.

## Ordem de execução imediata

1. Fundação v2 e contratos.
2. Source Registry + evidence + primeiro PostGIS.
3. Migrar São Paulo para o novo core sem desligar ZoLa.
4. Next.js client shell + MapLibre, consumindo o mesmo core.
5. Paridade funcional São Paulo; só então retirar dependências legacy.
6. Expandir etapas 3–11 na ordem do Blueprint.
