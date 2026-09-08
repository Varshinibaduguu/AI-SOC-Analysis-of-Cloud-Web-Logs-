#!/bin/sh
set -e

echo "Initializing database and demo analyst..."
python -m scripts.seed_admin

PORT="${PORT:-8000}"
echo "Starting API on port ${PORT}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}" --proxy-headers --forwarded-allow-ips="*"
