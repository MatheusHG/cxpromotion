#!/bin/sh
set -e

echo "[entrypoint] rodando migrate..."
node /app/dist/migrate.js

echo "[entrypoint] rodando seed..."
node /app/dist/seed.js

echo "[entrypoint] iniciando app..."
exec node /app/dist/index.js
