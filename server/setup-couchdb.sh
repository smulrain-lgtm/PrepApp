#!/usr/bin/env bash
# One-off CouchDB setup on the Pi: system databases, the household database,
# the sync user, and database security. Safe to run more than once.
#
# Usage (from the server/ directory, after `docker compose up -d`):
#   ./setup-couchdb.sh
set -euo pipefail

cd "$(dirname "$0")"
if [[ ! -f .env ]]; then
  echo "Missing server/.env – copy .env.example and fill it in first." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

for var in COUCHDB_ADMIN_USER COUCHDB_ADMIN_PASSWORD COUCHDB_DB COUCHDB_SYNC_USER COUCHDB_SYNC_PASSWORD; do
  if [[ -z "${!var:-}" ]]; then
    echo "Set $var in server/.env" >&2
    exit 1
  fi
done
if [[ "$COUCHDB_SYNC_PASSWORD$COUCHDB_SYNC_USER" == *[\"\\]* ]]; then
  echo "The sync username and password must not contain \" or \\ characters." >&2
  exit 1
fi
if (( ${#COUCHDB_SYNC_PASSWORD} < 20 )); then
  echo "Use a long random COUCHDB_SYNC_PASSWORD (20+ characters), e.g.: openssl rand -base64 24" >&2
  exit 1
fi

# Talks to CouchDB on the Pi itself (bound to 127.0.0.1 only).
COUCH="http://127.0.0.1:5984"
AUTH=(-u "${COUCHDB_ADMIN_USER}:${COUCHDB_ADMIN_PASSWORD}")

echo "Waiting for CouchDB..."
for _ in $(seq 1 30); do
  curl -fsS "$COUCH/_up" >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS "$COUCH/_up" >/dev/null || { echo "CouchDB is not answering on $COUCH" >&2; exit 1; }

put_db() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "${AUTH[@]}" -X PUT "$COUCH/$1")
  case "$code" in
    201|202) echo "Created database $1" ;;
    412) echo "Database $1 already exists" ;;
    *) echo "Creating $1 failed (HTTP $code)" >&2; exit 1 ;;
  esac
}

put_db _users
put_db _replicator
put_db "$COUCHDB_DB"

# Create or update the sync user.
USER_DOC="$COUCH/_users/org.couchdb.user:${COUCHDB_SYNC_USER}"
REV=$(curl -s "${AUTH[@]}" "$USER_DOC" | sed -n 's/.*"_rev":"\([^"]*\)".*/\1/p')
BODY=$(printf '{"name":"%s","password":"%s","roles":[],"type":"user"%s}' \
  "$COUCHDB_SYNC_USER" "$COUCHDB_SYNC_PASSWORD" "${REV:+,\"_rev\":\"$REV\"}")
curl -fsS "${AUTH[@]}" -X PUT "$USER_DOC" -H 'Content-Type: application/json' -d "$BODY" >/dev/null
echo "Sync user ${COUCHDB_SYNC_USER} is set up"

# Only the admin and the sync user may read or write the household database.
SECURITY=$(printf '{"admins":{"names":[],"roles":[]},"members":{"names":["%s"],"roles":[]}}' "$COUCHDB_SYNC_USER")
curl -fsS "${AUTH[@]}" -X PUT "$COUCH/$COUCHDB_DB/_security" -H 'Content-Type: application/json' -d "$SECURITY" >/dev/null
echo "Database $COUCHDB_DB is restricted to ${COUCHDB_SYNC_USER}"

echo "Done. In the app: Settings → Sync address https://${SYNC_HOST:-<your sync host>}, database ${COUCHDB_DB}, user ${COUCHDB_SYNC_USER}."
