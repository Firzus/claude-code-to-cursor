FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy application source
COPY index.ts tsconfig.json ./
COPY src/ ./src/

# Create data directories with correct ownership
RUN mkdir -p /data /data/logs /data/auth && chown -R bun:bun /data

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Environment defaults
ENV PORT=8082
ENV CCTC_DB_PATH=/data/cctc.db
ENV CCTC_AUTH_DIR=/data/auth
ENV LOG_DIR=/data/logs

EXPOSE 8082

USER bun

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:8082/health').then(r => process.exit(r.ok ? 0 : 1))"

ENTRYPOINT ["docker-entrypoint.sh"]
