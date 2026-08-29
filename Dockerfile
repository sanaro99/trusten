# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.6 AS application

USER root
WORKDIR /app

# Puppeteer installs its matching Chrome build and the Debian libraries Chrome
# needs. Keeping the cache outside a home directory makes it available to the
# unprivileged runtime user as well.
ENV PUPPETEER_CACHE_DIR=/opt/puppeteer
RUN mkdir -p "$PUPPETEER_CACHE_DIR" && chown -R bun:bun "$PUPPETEER_CACHE_DIR"

COPY --chown=bun:bun package.json bun.lock bunfig.toml ./
COPY --chown=bun:bun apps/server/package.json apps/server/package.json
COPY --chown=bun:bun apps/web/package.json apps/web/package.json
COPY --chown=bun:bun packages/shared/package.json packages/shared/package.json
COPY --chown=bun:bun packages/ui/package.json packages/ui/package.json

USER bun
RUN bun install --frozen-lockfile

USER root
RUN bunx puppeteer browsers install chrome --install-deps

COPY --chown=bun:bun . .
USER bun
RUN bun run build:web

ENV NODE_ENV=production \
    HOME=/data \
    TRUSTEN_PORT=9200 \
    HOST=0.0.0.0 \
    PORT=3000

EXPOSE 3000 9200
CMD ["bun", "run", "start"]

FROM caddy:2.11.4-alpine AS proxy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
EXPOSE 8080
