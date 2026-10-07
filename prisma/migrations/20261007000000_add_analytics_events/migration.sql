-- CreateTable: AnalyticsEvent (#116 — baseline instrumentation of the 4 trust
-- metrics). Self-hosted, no vendor. Written only by src/lib/track.ts.
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT,
    "bookingId" TEXT,
    "eventType" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: lookup by the optional principals + time-scoped queries
CREATE INDEX "AnalyticsEvent_userId_idx" ON "AnalyticsEvent"("userId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_bookingId_idx" ON "AnalyticsEvent"("bookingId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");

-- CreateIndex: hot path for the metrics script (type + time window)
CREATE INDEX "AnalyticsEvent_type_createdAt_idx" ON "AnalyticsEvent"("type", "createdAt");
