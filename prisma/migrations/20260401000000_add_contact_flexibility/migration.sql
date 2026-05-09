-- AlterTable: add LinkedIn to Booking
ALTER TABLE "Booking" ADD COLUMN "bookerLinkedin" TEXT;

-- AlterTable: add LinkedIn to Contact, make email optional
ALTER TABLE "Contact" ADD COLUMN "linkedin" TEXT;
ALTER TABLE "Contact" ALTER COLUMN "email" DROP NOT NULL;
