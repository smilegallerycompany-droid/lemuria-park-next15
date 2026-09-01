# Production image for Yandex Cloud Serverless Containers (linux/amd64).
# Build in RU region builders so next/font and npm resolve without VPN.
FROM --platform=linux/amd64 node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM --platform=linux/amd64 node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_BUILD=1
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
# Build-time placeholder only — runtime DATABASE_URL comes from Lockbox/env.
ARG DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV DATABASE_URL=$DATABASE_URL
RUN npx prisma generate && npm run build

FROM --platform=linux/amd64 node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Do not pin PORT. Yandex Serverless Containers injects PORT (8080) and probes 127.0.0.1:$PORT.
# Local: docker run -e PORT=3000 -p 3000:3000 …
ARG GIT_SHA=
ENV GIT_SHA=$GIT_SHA
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && useradd -m nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY container-start.sh /app/container-start.sh
COPY container-bootstrap.cjs /app/container-bootstrap.cjs
# Prisma CLI for optional staging migrate/seed. Production must not set RUN_MIGRATE_ON_START.
RUN npm install -g prisma@6.19.3 \
  && chmod 755 /app/container-start.sh /app/container-bootstrap.cjs
USER nextjs
EXPOSE 8080
CMD ["/app/container-start.sh"]
