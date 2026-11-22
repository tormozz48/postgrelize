#!/bin/sh
# PostgreSQL for the v6 suite, separate from the development database (port 54329): v6's tests drop
# everything in their database. Usage: db.sh up | down
set -e
name=pgz-v6-suite
case "$1" in
  up)
    docker rm -f "$name" >/dev/null 2>&1 || true
    docker run -d --name "$name" -p 54399:5432 -e POSTGRES_PASSWORD=postgres \
      "postgres:${PGZ_PG_VERSION:-17}" -c max_connections=300 -c fsync=off >/dev/null
    until docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
    # the entrypoint restarts the server once after initialisation
    sleep 3
    until docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
    ;;
  down) docker rm -f "$name" >/dev/null ;;
  *) echo "usage: db.sh up|down" >&2; exit 1 ;;
esac
