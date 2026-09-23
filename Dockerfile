# syntax=docker/dockerfile:1.7

FROM oven/bun:1.4.0 AS application

USER root
WORKDIR /app

# Puppeteer installs its matching Chrome build and the Debian libraries Chrome
# needs. Keeping the cache outside a home directory makes it available to the
# unprivileged runtime user as well.
ENV PUPPETEER_CACHE_DIR=/opt/puppeteer
RUN mkdir -p "$PUPPETEER_CACHE_DIR" && \
    chown -R bun:bun /app "$PUPPETEER_CACHE_DIR"

COPY --chown=bun:bun package.json bun.lock bunfig.toml ./
COPY --chown=bun:bun apps/server/package.json apps/server/package.json
COPY --chown=bun:bun apps/web/package.json apps/web/package.json
COPY --chown=bun:bun packages/shared/package.json packages/shared/package.json
COPY --chown=bun:bun packages/ui/package.json packages/ui/package.json

USER bun
RUN bun install --frozen-lockfile

USER root
RUN apt-get update && \
    bun apps/server/node_modules/puppeteer/lib/cjs/puppeteer/node/cli.js \
      browsers install chrome --install-deps && \
    rm -rf /var/lib/apt/lists/*

COPY --chown=bun:bun . .
USER bun
RUN bun run build:web

ENV NODE_ENV=production \
    HOME=/data \
    XDG_CONFIG_HOME=/tmp/.chromium \
    XDG_CACHE_HOME=/tmp/.chromium \
    TRUSTEN_PORT=9200 \
    HOST=0.0.0.0 \
    PORT=3000

# Catch Chromium startup failures in the image before a user starts a scan.
RUN cd apps/server && bun -e "import puppeteer from 'puppeteer'; const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] }); await browser.close()"

EXPOSE 3000 9200
CMD ["bun", "run", "start"]

FROM caddy:2.11.4-alpine AS proxy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
EXPOSE 8080
