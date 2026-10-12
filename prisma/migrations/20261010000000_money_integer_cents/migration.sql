-- #97: money fields Float (dollars) -> Int (cents).
-- Backfill: ROUND(("col")::numeric * 100). The numeric cast avoids binary-float
-- artifacts (19.99 -> 1999) and numeric ROUND is half-up (away from zero) for
-- the sub-cent case. NULLs stay NULL. USING converts in place, so rows are
-- preserved; each ALTER is transactional.
ALTER TABLE "EventType" ALTER COLUMN "price" TYPE INTEGER USING ROUND("price"::numeric * 100)::INTEGER;
ALTER TABLE "Booking" ALTER COLUMN "paymentAmount" TYPE INTEGER USING ROUND("paymentAmount"::numeric * 100)::INTEGER;
