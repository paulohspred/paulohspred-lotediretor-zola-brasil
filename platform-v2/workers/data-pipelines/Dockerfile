FROM node:22-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY workers/data-pipelines/package.json workers/data-pipelines/package.json
RUN pnpm install --frozen-lockfile --filter @lotediretor/data-pipelines...
COPY workers/data-pipelines workers/data-pipelines
RUN pnpm --filter @lotediretor/data-pipelines build

FROM node:22-bookworm-slim AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
RUN apt-get update   && apt-get install -y --no-install-recommends ca-certificates python3 python3-venv   && rm -rf /var/lib/apt/lists/*
COPY workers/data-pipelines/requirements-terrain.txt /tmp/requirements-terrain.txt
RUN python3 -m venv /opt/terrain-venv   && /opt/terrain-venv/bin/pip install --no-cache-dir -r /tmp/requirements-terrain.txt
ENV TERRAIN_PYTHON=/opt/terrain-venv/bin/python
RUN corepack enable
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/workers/data-pipelines/node_modules ./workers/data-pipelines/node_modules
COPY --from=build /workspace/workers/data-pipelines/package.json ./workers/data-pipelines/package.json
COPY --from=build /workspace/workers/data-pipelines/dist ./workers/data-pipelines/dist
COPY --from=build /workspace/workers/data-pipelines/src/analyze-terrain-laz.py ./workers/data-pipelines/dist/analyze-terrain-laz.py
USER node
ENTRYPOINT ["node", "workers/data-pipelines/dist/ingest-source-snapshot.js"]
