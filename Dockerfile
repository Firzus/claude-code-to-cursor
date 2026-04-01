FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy application source
COPY index.ts tsconfig.json ./
COPY src/ ./src/

# Create data directories
RUN mkdir -p /data /data/logs /data/auth

# Environment defaults
ENV PORT=8082
ENV CCTC_DB_PATH=/data/cctc.db
ENV CCTC_AUTH_DIR=/data/auth
ENV LOG_DIR=/data/logs

EXPOSE 8082

CMD ["bun", "run", "index.ts"]
