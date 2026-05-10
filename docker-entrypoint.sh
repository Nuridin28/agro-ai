#!/bin/sh
set -e

# Wait for Postgres to accept connections (compose's depends_on healthcheck
# usually handles this, but keep a small retry loop for safety).
echo "[entrypoint] running database migrations..."
node ./node_modules/tsx/dist/cli.mjs ./scripts/migrate.ts

# Optional one-time import of legacy data/*.json. Controlled by env so we
# don't accidentally re-import every startup.
if [ "${SEED_FROM_JSON}" = "1" ]; then
  echo "[entrypoint] seeding from data/*.json..."
  node ./node_modules/tsx/dist/cli.mjs ./scripts/seed-from-json.ts
fi

echo "[entrypoint] starting app: $@"
exec "$@"
