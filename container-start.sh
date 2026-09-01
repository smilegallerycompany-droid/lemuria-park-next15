#!/bin/sh
# Yandex Serverless Containers entrypoint.
# DATABASE_URL is assembled by container-bootstrap.cjs when only DB_* are set.
# RUN_MIGRATE_ON_START / RUN_STAGING_SEED_ON_START are refused unless APP_ENV=staging.
set -e
exec node /app/container-bootstrap.cjs
