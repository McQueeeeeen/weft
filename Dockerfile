FROM node:24-alpine AS base
RUN npm install -g pnpm@12.9.1
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @weft/web build

FROM base AS runtime
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data STATIC_DIR=/app/web
RUN pnpm install --frozen-lockfile --prod --filter @weft/server && mkdir /data && chown node:node /data
COPY apps/server/src apps/server/src
COPY --from=build /app/apps/web/dist /app/web
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://localhost:8080/health || exit 1
CMD ["node", "apps/server/src/index.ts"]
