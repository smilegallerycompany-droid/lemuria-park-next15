#!/usr/bin/env bash
# Bootstrap isolated staging: separate Postgres + strong secrets + seed + production server.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${STAGING_PORT:-3002}"
COMPOSE_FILE="docker-compose.staging.yml"
ENV_FILE=".env.staging"
SHA="$(git rev-parse HEAD)"

echo "==> Staging Postgres"
docker compose -f "$COMPOSE_FILE" up -d
echo "Waiting for Postgres..."
for i in $(seq 1 30); do
  if docker exec lemuria-staging-postgres pg_isready -U lemuria_staging -d lemuria_staging >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if [[ ! -f "$ENV_FILE" ]]; then
  AUTH="$(openssl rand -hex 32)"
  QR="$(openssl rand -hex 32)"
  cat > "$ENV_FILE" <<EOF
# Generated staging secrets — DO NOT commit. Not production.
APP_ENV=staging
NEXT_PUBLIC_APP_ENV=staging
STAGING=1
NODE_ENV=production
GIT_SHA=${SHA}
DATABASE_URL=postgresql://lemuria_staging:lemuria_staging_pw_rc2@127.0.0.1:5433/lemuria_staging?schema=public
NEXT_PUBLIC_APP_URL=http://127.0.0.1:${PORT}
AUTH_SECRET=${AUTH}
QR_SIGNING_SECRET=${QR}
YUKASSA_SHOP_ID=
YUKASSA_SECRET_KEY=
EMAIL_PROVIDER=none
EMAIL_FROM=staging-tickets@lemuria.local
ERROR_MONITORING_DSN=
EOF
  echo "Wrote $ENV_FILE"
else
  # refresh SHA / APP_URL port hints without rotating secrets
  grep -q '^GIT_SHA=' "$ENV_FILE" && sed -i.bak "s|^GIT_SHA=.*|GIT_SHA=${SHA}|" "$ENV_FILE" || echo "GIT_SHA=${SHA}" >> "$ENV_FILE"
  rm -f "${ENV_FILE}.bak"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "==> Migrate"
npx prisma migrate deploy

echo "==> Seed (NODE_ENV overridden for seed only — staging DB, not production)"
NODE_ENV=development npx prisma db seed

echo "==> QR acceptance fixtures"
npx tsx scripts/staging-qr-fixtures.ts

echo "==> Build"
DOCKER_BUILD=0 \
NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL}" \
NEXT_PUBLIC_APP_ENV=staging \
npm run build

echo "==> Ready. Start with:"
echo "  set -a; source .env.staging; set +a; npx next start -p ${PORT}"
echo "Then tunnel:"
echo "  /tmp/cloudflared tunnel --url http://127.0.0.1:${PORT}"
echo "Update NEXT_PUBLIC_APP_URL in .env.staging to the HTTPS tunnel URL and rebuild if absolute client URLs matter."
