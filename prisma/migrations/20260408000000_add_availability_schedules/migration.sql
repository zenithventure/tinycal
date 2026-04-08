-- CreateTable: AvailabilitySchedule
CREATE TABLE "AvailabilitySchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilitySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AvailabilityRule
CREATE TABLE "AvailabilityRule" (
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
ALTER TABLE "EventType" ADD COLUMN "availabilityScheduleId" TEXT;

-- AlterTable: User
ALTER TABLE "User" ADD COLUMN "defaultAvailabilityScheduleId" TEXT UNIQUE;

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilitySchedule_userId_name_key" ON "AvailabilitySchedule"("userId", "name");

-- CreateIndex
CREATE INDEX "AvailabilitySchedule_userId_isDefault_idx" ON "AvailabilitySchedule"("userId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityRule_availabilityScheduleId_dayOfWeek_date_key" ON "AvailabilityRule"("availabilityScheduleId", "dayOfWeek", "date");

-- AddForeignKey
ALTER TABLE "AvailabilitySchedule" ADD CONSTRAINT "AvailabilitySchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_availabilityScheduleId_fkey" FOREIGN KEY ("availabilityScheduleId") REFERENCES "AvailabilitySchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventType" ADD CONSTRAINT "EventType_availabilityScheduleId_fkey" FOREIGN KEY ("availabilityScheduleId") REFERENCES "AvailabilitySchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_defaultAvailabilityScheduleId_fkey" FOREIGN KEY ("defaultAvailabilityScheduleId") REFERENCES "AvailabilitySchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
