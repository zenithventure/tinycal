-- Idempotent: this migration was retried in preview environments where some
-- tables/columns/constraints already existed. Each statement is guarded so the
-- migration can be applied to a partially-populated database without erroring.

-- CreateTable: AvailabilitySchedule
CREATE TABLE IF NOT EXISTS "AvailabilitySchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilitySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AvailabilityRule
CREATE TABLE IF NOT EXISTS "AvailabilityRule" (
    "id" TEXT NOT NULL,
    "availabilityScheduleId" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "date" TIMESTAMP(3),
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- AlterTable: EventType
ALTER TABLE "EventType" ADD COLUMN IF NOT EXISTS "availabilityScheduleId" TEXT;

-- AlterTable: User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultAvailabilityScheduleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AvailabilitySchedule_userId_name_key" ON "AvailabilitySchedule"("userId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AvailabilitySchedule_userId_isDefault_idx" ON "AvailabilitySchedule"("userId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AvailabilityRule_availabilityScheduleId_dayOfWeek_date_key" ON "AvailabilityRule"("availabilityScheduleId", "dayOfWeek", "date");

-- Unique constraint on User.defaultAvailabilityScheduleId — Postgres has no
-- ADD CONSTRAINT IF NOT EXISTS, so guard via catalog lookup.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'User_defaultAvailabilityScheduleId_key'
    ) THEN
        ALTER TABLE "User"
            ADD CONSTRAINT "User_defaultAvailabilityScheduleId_key"
            UNIQUE ("defaultAvailabilityScheduleId");
    END IF;
END$$;

-- AddForeignKey: AvailabilitySchedule.userId -> User.id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'AvailabilitySchedule_userId_fkey'
    ) THEN
        ALTER TABLE "AvailabilitySchedule"
            ADD CONSTRAINT "AvailabilitySchedule_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END$$;

-- AddForeignKey: AvailabilityRule.availabilityScheduleId -> AvailabilitySchedule.id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'AvailabilityRule_availabilityScheduleId_fkey'
    ) THEN
        ALTER TABLE "AvailabilityRule"
            ADD CONSTRAINT "AvailabilityRule_availabilityScheduleId_fkey"
            FOREIGN KEY ("availabilityScheduleId") REFERENCES "AvailabilitySchedule"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END$$;

-- AddForeignKey: EventType.availabilityScheduleId -> AvailabilitySchedule.id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'EventType_availabilityScheduleId_fkey'
    ) THEN
        ALTER TABLE "EventType"
            ADD CONSTRAINT "EventType_availabilityScheduleId_fkey"
            FOREIGN KEY ("availabilityScheduleId") REFERENCES "AvailabilitySchedule"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END$$;

-- AddForeignKey: User.defaultAvailabilityScheduleId -> AvailabilitySchedule.id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'User_defaultAvailabilityScheduleId_fkey'
    ) THEN
        ALTER TABLE "User"
            ADD CONSTRAINT "User_defaultAvailabilityScheduleId_fkey"
            FOREIGN KEY ("defaultAvailabilityScheduleId") REFERENCES "AvailabilitySchedule"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END$$;
