// Shared bearer-token check for /api/cron/* routes.
//
// process.env.CRON_SECRET is trimmed because Vercel's `env add` CLI flows
// (and other paste-into-dashboard flows) can leave a trailing newline that
// turns a strict `Bearer ${secret}` comparison into a silent 401.
export function isAuthorizedCronRequest(req: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) return false
  return req.headers.get("Authorization") === `Bearer ${expected}`
}
