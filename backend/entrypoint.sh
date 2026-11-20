#!/bin/sh
set -e
alembic upgrade head
[ "${RUN_SEED:-false}" = "true" ] && python -m app.seed
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
