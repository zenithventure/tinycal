export default function UnsubscribedPage({ searchParams }: { searchParams: { status?: string } }) {
  const invalid = searchParams.status === "invalid"
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">{invalid ? "Invalid unsubscribe link" : "You're unsubscribed"}</h1>
      <p className="mt-2 text-gray-600">
        {invalid
          ? "This link is not valid. Contact support if you keep receiving release emails."
          : "You will no longer receive TinyCal release announcements."}
      </p>
    </main>
  )
}
