FROM node:22.23.1-alpine3.23@sha256:8516dce0483394d5708d4b2ee6cacb79fb1d617ea4e2787c2120bcca92ce372e AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @furg/processos-contracts build \
  && pnpm --filter @furg/processos-bpmn build \
  && pnpm --filter @furg/processos-bundle build \
  && pnpm --filter @furg/processos-api prisma:generate \
  && pnpm --filter @furg/processos-api build

FROM node:22.23.1-alpine3.23@sha256:8516dce0483394d5708d4b2ee6cacb79fb1d617ea4e2787c2120bcca92ce372e
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "-c", "node apps/api/node_modules/prisma/build/index.js migrate deploy --config apps/api/prisma.config.ts && node apps/api/dist/main.js"]
