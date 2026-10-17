# Container for the cloud ingestion jobs (ingest-acquire, ingest-build, ingest-agent).
# Build from the repository root:  docker build -f ingest/Dockerfile -t ingest .
# One image, several entrypoints: the job's args pick the task (`acquire`, `build`, ...).

FROM node:22-slim AS build
WORKDIR /app
# Workspace manifests first, so dependency layers are cached across source changes.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY ingest/package.json ingest/
COPY functions/package.json functions/
COPY web/package.json web/
COPY e2e/package.json e2e/
RUN npm ci --workspace @fund-tracker/shared --workspace ingest --ignore-scripts --no-audit --no-fund
COPY packages/shared packages/shared
COPY ingest ingest
RUN npm run build -w @fund-tracker/shared && npm run build -w ingest

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY ingest/package.json ingest/
COPY functions/package.json functions/
COPY web/package.json web/
COPY e2e/package.json e2e/
RUN npm ci --omit=dev --workspace @fund-tracker/shared --workspace ingest --ignore-scripts --no-audit --no-fund

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/package.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/ingest/package.json ingest/
COPY --from=build /app/ingest/dist ingest/dist
# Least privilege inside the container too: never run as root.
USER node
WORKDIR /app/ingest
ENTRYPOINT ["node", "dist/cloud/main.js"]
