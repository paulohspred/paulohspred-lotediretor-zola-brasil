#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f platform-v2/infra/docker/compose.yaml --env-file platform-v2/.env.example)
mkdir -p platform-v2/packages/contracts/openapi platform-v2/packages/contracts/graphql

curl -fsS http://127.0.0.1:54000/api/docs/openapi.json | python3 -c '
import json,sys
obj=json.load(sys.stdin)
json.dump(obj,sys.stdout,ensure_ascii=False,indent=2,sort_keys=True)
print()
' > platform-v2/packages/contracts/openapi/platform-api.v1.json

"${COMPOSE[@]}" exec -T platform-api sh -lc 'cd services/platform-api && node' > platform-v2/packages/contracts/graphql/platform-api.graphql <<'NODE'
const { buildClientSchema, getIntrospectionQuery, printSchema } = require('graphql');
(async () => {
  const response = await fetch('http://127.0.0.1:3000/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
  });
  if (!response.ok) throw new Error(`GraphQL introspection HTTP ${response.status}`);
  const body = await response.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  process.stdout.write(`${printSchema(buildClientSchema(body.data))}\n`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

echo 'contracts-export=OK openapi=platform-api.v1.json graphql=platform-api.graphql'
