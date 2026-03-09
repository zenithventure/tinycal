import Link from "next/link"
import prisma from "@/lib/prisma"
import { notFound } from "next/navigation"
import { Clock } from "lucide-react"
import { formatDuration } from "@/lib/utils"

export default async function UserBookingPage({ params }: { params: { username: string } }) {
  const user = await prisma.user.findUnique({
    where: { slug: params.username },
    include: {
      eventTypes: {
        where: { active: true },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!user) return notFound()

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* User profile */}
        <div className="text-center mb-8">
          {user.brandLogo ? (
            <img src={user.brandLogo} alt={user.name || ""} className="w-16 h-16 rounded-full mx-auto mb-3" />
          ) : (
            <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center text-2xl font-bold text-white"
              style={{ backgroundColor: user.brandColor }}>
              {user.name?.[0] || "?"}
            </div>
          )}
          <h1 className="text-xl font-bold">{user.name}</h1>
          <p className="text-gray-500 text-sm">Select an event to book</p>
        </div>

        {/* Event types */}
        <div className="space-y-3">
          {user.eventTypes.map((et) => (
            <Link
              key={et.id}
              href={`/${params.username}/${et.slug}`}
              className="block bg-white border rounded-xl p-5 hover:shadow-md transition"
              style={{ borderLeftColor: et.color, borderLeftWidth: 4 }}
            >
              <h2 className="font-semibold">{et.title}</h2>
              {et.description && <p className="text-sm text-gray-600 mt-1">{et.description}</p>}
              <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                <Clock className="w-4 h-4" /> {formatDuration(et.duration)}
              </div>
            </Link>
          ))}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Powered by <Link href="/" className="text-blue-600 hover:underline">TinyCal</Link>
        </p>
      </div>
    </div>
  )
}
