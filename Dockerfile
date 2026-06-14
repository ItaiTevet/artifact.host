# syntax=docker/dockerfile:1
# Self-host image for artifact.host (SQLite + local-password by default).
# Build:  docker build -t artifact-host .
# Run:    docker compose up   (see docker-compose.yml)

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
# Provider is baked into the client bundle at build time. Defaults target self-host;
# override with --build-arg to build a Supabase/OIDC image.
ARG DB_DRIVER=sqlite
ARG AUTH_PROVIDER=local-password
ARG NEXT_PUBLIC_AUTH_PROVIDER=local-password
ENV DB_DRIVER=$DB_DRIVER \
    AUTH_PROVIDER=$AUTH_PROVIDER \
    NEXT_PUBLIC_AUTH_PROVIDER=$NEXT_PUBLIC_AUTH_PROVIDER \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    SQLITE_PATH=/data/artifacts.db
RUN useradd -m app && mkdir -p /data && chown app:app /data
# Next.js standalone output bundles a minimal server + traced deps (incl. better-sqlite3).
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER app
EXPOSE 3000
VOLUME /data
CMD ["node", "server.js"]
