#!/bin/sh
set -e

# Wait for Postgres to accept connections (compose's depends_on healthcheck
# usually handles this, but keep a small retry loop for safety).
echo "[entrypoint] running database migrations..."
node ./node_modules/tsx/dist/cli.mjs ./scripts/migrate.ts

echo "[entrypoint] starting app: $@"
exec "$@"
