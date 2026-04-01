-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('BOOKING_PAGE', 'MEETING_LINK');

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'PENDING_CONFIRMATION';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "source" "BookingSource" NOT NULL DEFAULT 'BOOKING_PAGE',
ADD COLUMN "recipientNote" TEXT,
ADD COLUMN "confirmedAt" TIMESTAMP(3);
