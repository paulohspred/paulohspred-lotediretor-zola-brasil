FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/platform-api/package.json services/platform-api/package.json
RUN pnpm install --frozen-lockfile --filter @lotediretor/platform-api...
COPY services/platform-api services/platform-api
RUN pnpm --filter @lotediretor/platform-api build

FROM node:22-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/services/platform-api/node_modules ./services/platform-api/node_modules
COPY --from=build /workspace/services/platform-api/package.json ./services/platform-api/package.json
COPY --from=build /workspace/services/platform-api/dist ./services/platform-api/dist
USER node
EXPOSE 3000
CMD ["node", "services/platform-api/dist/main.js"]
