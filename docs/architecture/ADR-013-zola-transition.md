# ADR-013 — Transição do ZoLa Brasil para a plataforma v2

**Status:** Aceito

## Contexto

A adaptação do ZoLa comprovou o município laboratório São Paulo e várias capacidades de produto. O Blueprint Final v2.0 define, porém, React/Next.js como stack web unificada, NestJS/Fastify/Mercurius no core, PostGIS/Martin/MapLibre/deck.gl no GIS e separação entre Data Plane e Control Plane.

## Decisão

1. Preservar o ZoLa Brasil operacional como **legacy city-lab** até a plataforma v2 atingir paridade.
2. Construir a nova arquitetura dentro de `platform-v2/` durante a transição.
3. Novos bounded contexts, contratos, banco, IAM, evidence, ingestão nacional, IA, billing e módulos SaaS nascem somente na v2.
4. Correções de dados e estabilidade no ZoLa continuam permitidas enquanto ele for frontend ativo.
5. Cada função migrada exige contrato, teste de regressão e comparação com fixtures/lotes reais já validados no ZoLa.
6. A remoção do ZoLa só ocorre após paridade funcional de São Paulo e smoke/e2e aprovados na nova UI.

## Consequências

- evitamos reescrita big-bang;
- preservamos a aplicação utilizável;
- o ZoLa fornece fixtures de comportamento, mas não dita a arquitetura final;
- durante a transição existirão dois frontends, com ownership claro.
