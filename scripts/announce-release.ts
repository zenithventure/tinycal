/* eslint-disable no-console */
// Emails the latest data/changelog.json entry to all users with an email who
// have not opted out (emailOptOut IS NOT TRUE).
//
// Usage:
//   DRY_RUN=1 npx tsx scripts/announce-release.ts   # log count + sample, send nothing
//   npx tsx scripts/announce-release.ts             # real send (needs RESEND_API_KEY, AUTH_SECRET, NEXT_PUBLIC_APP_URL)

import { latestChangelogEntry, sendReleaseAnnouncement } from "../src/lib/email-service"
import prisma from "../src/lib/prisma"

async function main() {
  const entry = latestChangelogEntry()
  if (!entry) throw new Error("data/changelog.json has no entries")
  const dryRun = ["1", "true"].includes((process.env.DRY_RUN || "").toLowerCase())

  const r = await sendReleaseAnnouncement(entry, { dryRun })
  if (dryRun) {
    console.log(`[DRY RUN] "${entry.title}": ${r.recipients} recipient(s); nothing sent.`)
    console.log("[DRY RUN] sample:", r.sample ?? "(none)")
  } else {
    console.log(`"${entry.title}": ${r.recipients} recipient(s), sent ${r.sent}, failed ${r.failed}`)
    if (r.failed) process.exitCode = 1
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
