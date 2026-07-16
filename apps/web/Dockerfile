FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY vendor ./vendor
COPY packages ./packages
COPY apps/web ./apps/web
ARG VITE_API_URL=/api/v1
ARG VITE_PUBLIC_SITE_URL=http://localhost:8080
ARG VITE_PUBLIC_INDEXING=false
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PUBLIC_SITE_URL=$VITE_PUBLIC_SITE_URL
ENV VITE_PUBLIC_INDEXING=$VITE_PUBLIC_INDEXING
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @furg/processos-web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
