#!/bin/sh
# Yandex Serverless Containers entrypoint.
# RUN_MIGRATE_ON_START / RUN_STAGING_SEED_ON_START are refused unless APP_ENV=staging.
set -e

if [ "${RUN_MIGRATE_ON_START:-}" = "1" ]; then
  if [ "${APP_ENV:-}" != "staging" ]; then
    echo "Refusing RUN_MIGRATE_ON_START: APP_ENV must be staging (got '${APP_ENV:-}')." >&2
    exit 1
  fi
  prisma migrate deploy
fi

if [ "${RUN_STAGING_SEED_ON_START:-}" = "1" ]; then
  if [ "${APP_ENV:-}" != "staging" ]; then
    echo "Refusing RUN_STAGING_SEED_ON_START: APP_ENV must be staging (got '${APP_ENV:-}')." >&2
    exit 1
  fi
  if [ "${ALLOW_STAGING_SEED:-}" != "1" ]; then
    echo "Refusing seed: ALLOW_STAGING_SEED=1 is required." >&2
    exit 1
  fi
  node prisma/staging-seed.cjs
fi

exec node server.js
