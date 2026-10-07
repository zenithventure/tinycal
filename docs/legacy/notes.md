# Legacy notes / follow-ups

Items left over from the AWS/Cognito era. None were changed as part of the docs reconciliation (issue #101); each is a candidate follow-up.

## `User.cognitoId` column (drop candidate)

- Added by migration `prisma/migrations/20260216000000_add_cognito_support/migration.sql` (`ADD COLUMN "cognitoId"` + unique index `User_cognitoId_key`).
- **It is no longer in `prisma/schema.prisma`** and no code, script, or test references it. No later migration drops it, so the column and its unique index most likely still exist in databases migrated from history. That is schema drift between the Prisma schema and the real DB.
- Follow-up: add a new forward migration that does `DROP INDEX "User_cognitoId_key"; ALTER TABLE "User" DROP COLUMN "cognitoId";` (verify against a prod snapshot with `prisma migrate diff` first). Do not edit the old migration.

## Other Cognito/AWS references still in the repo

- `src/app/privacy/page.tsx` lists "Amazon Cognito" as an example authentication provider — should say Google.
- `docs/design/03-user-flows-scheduling.md` (~line 396) and `docs/design/05-information-architecture.md` (~line 57) describe Cognito/Amplify auth. These are historical design docs; update or annotate.
- `railway.json` at the repo root configures a Railway deploy (`prisma migrate deploy && npm start`). Production is Vercel; confirm whether Railway is still used and remove if not. (The `Dockerfile` is kept for local/container runs.)
- The `deploy-migrations.yml` workflow references `dev`/`qa`/`prod` GitHub environments, a holdover from the account-per-environment AWS setup.
