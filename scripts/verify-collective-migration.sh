#!/usr/bin/env bash
# Verifies the #98 data migration against a SCRATCH Postgres (never prod).
# Applies every migration before 20261009000000, seeds legacy String[] data
# (valid ids, a dangling id, a duplicate), applies the new migration, and
# asserts the join table holds exactly the resolvable, de-duplicated members.
#
#   DATABASE_URL=postgresql://localhost:5432/scratch scripts/verify-collective-migration.sh
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL to a scratch database}"
cd "$(dirname "$0")/.."
NEW=20261009000000_event_collective_member

# Apply the pre-#98 migrations by running their SQL in order.
for d in prisma/migrations/*/; do
  n=$(basename "$d")
  [[ "$n" < "20261009000000" ]] && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$d/migration.sql" >/dev/null
done

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
INSERT INTO "User"(id, email, "updatedAt") VALUES ('m-owner','m-owner@x.test',now()),('m-a','m-a@x.test',now()),('m-b','m-b@x.test',now());
INSERT INTO "EventType"(id,"userId",title,slug,"isCollective","collectiveMembers","updatedAt")
VALUES ('m-et1','m-owner','Panel','m-panel',true,ARRAY['m-a','m-b','m-ghost','m-a'],now()),
       ('m-et2','m-owner','Solo','m-solo',false,ARRAY[]::text[],now());
SQL

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "prisma/migrations/$NEW/migration.sql" >/dev/null

got=$(psql "$DATABASE_URL" -At -c "SELECT \"eventTypeId\"||':'||\"userId\" FROM \"EventCollectiveMember\" WHERE \"eventTypeId\" LIKE 'm-%' ORDER BY 1")
want=$'m-et1:m-a\nm-et1:m-b'
if [[ "$got" == "$want" ]]; then echo "OK: migrated members = [m-a, m-b] (dangling + duplicate dropped)"; else echo "FAIL: got:"; echo "$got"; exit 1; fi
psql "$DATABASE_URL" -At -c "SELECT count(*) FROM information_schema.columns WHERE table_name='EventType' AND column_name='collectiveMembers'" | grep -qx 0 && echo "OK: legacy column dropped"
