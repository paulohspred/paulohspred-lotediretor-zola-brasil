FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY workers/data-pipelines/package.json workers/data-pipelines/package.json
RUN pnpm install --frozen-lockfile --filter @lotediretor/data-pipelines...
COPY workers/data-pipelines workers/data-pipelines
RUN pnpm --filter @lotediretor/data-pipelines build

FROM node:22-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/workers/data-pipelines/node_modules ./workers/data-pipelines/node_modules
COPY --from=build /workspace/workers/data-pipelines/package.json ./workers/data-pipelines/package.json
COPY --from=build /workspace/workers/data-pipelines/dist ./workers/data-pipelines/dist
USER node
ENTRYPOINT ["node", "workers/data-pipelines/dist/ingest-source-snapshot.js"]
