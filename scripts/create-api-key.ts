/* eslint-disable no-console */
// Mints a new API key for a user. Until the Settings → API Keys dashboard
// ships, ops uses this script to provision keys for server-to-server clients
// (e.g. the Mira concierge bot).
//
// Usage:
//   npx tsx scripts/create-api-key.ts <userIdOrEmail> "<name>"
//
// Example:
//   npx tsx scripts/create-api-key.ts user@example.com "Mira concierge"
//
// The full key is printed exactly once. Save it somewhere safe (e.g. AWS
// Secrets Manager, the bot's deploy env). It cannot be retrieved later — if
// lost, revoke and mint a new one.

import { PrismaClient } from "@prisma/client"
import { generateApiKey } from "../src/lib/api-keys/generate"

async function main() {
  const [userIdOrEmail, name] = process.argv.slice(2)
  if (!userIdOrEmail || !name) {
    console.error('Usage: npx tsx scripts/create-api-key.ts <userIdOrEmail> "<name>"')
    process.exit(1)
  }

  const prisma = new PrismaClient()
  try {
    const user = userIdOrEmail.includes("@")
      ? await prisma.user.findUnique({ where: { email: userIdOrEmail } })
      : await prisma.user.findUnique({ where: { id: userIdOrEmail } })

    if (!user) {
      console.error(`No user found for: ${userIdOrEmail}`)
      process.exit(1)
    }

    const { fullKey, prefix, hashedSecret } = generateApiKey()

    await prisma.apiKey.create({
      data: {
        userId: user.id,
        prefix,
        hashedSecret,
        name,
        scopes: [],
      },
    })

    console.log(`Created API key for ${user.email ?? user.id} (${name})`)
    console.log(`Prefix: ${prefix}`)
    console.log(``)
    console.log(`API Key (save this — it will not be shown again):`)
    console.log(`  ${fullKey}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
