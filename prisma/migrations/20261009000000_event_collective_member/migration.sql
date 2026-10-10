-- #98: replace EventType.collectiveMembers (String[] of user ids, no FK) with a
-- real join table. Deleting a user now cascades to their memberships.

-- CreateTable
CREATE TABLE "EventCollectiveMember" (
    "eventTypeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventCollectiveMember_pkey" PRIMARY KEY ("eventTypeId","userId")
);

-- CreateIndex
CREATE INDEX "EventCollectiveMember_userId_idx" ON "EventCollectiveMember"("userId");

-- AddForeignKey
ALTER TABLE "EventCollectiveMember" ADD CONSTRAINT "EventCollectiveMember_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCollectiveMember" ADD CONSTRAINT "EventCollectiveMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: copy every existing array entry that still resolves to a
-- user. Dangling ids (the bug this fixes) cannot satisfy the FK and are
-- dropped; duplicates within an array collapse via DISTINCT.
INSERT INTO "EventCollectiveMember" ("eventTypeId", "userId")
SELECT DISTINCT et."id", m.member_id
FROM "EventType" et
CROSS JOIN LATERAL unnest(et."collectiveMembers") AS m(member_id)
JOIN "User" u ON u."id" = m.member_id;

-- Drop the old array column now that its data lives in the join table.
ALTER TABLE "EventType" DROP COLUMN "collectiveMembers";
