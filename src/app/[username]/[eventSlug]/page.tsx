import prisma from "@/lib/prisma"
import { notFound } from "next/navigation"
import { track } from "@/lib/track"
import BookingWidget from "@/components/booking-widget"

export default async function BookingPage({
  params,
}: {
  params: { username: string; eventSlug: string }
}) {
  const user = await prisma.user.findUnique({
    where: { slug: params.username },
  })
  if (!user) return notFound()

  const eventType = await prisma.eventType.findFirst({
    where: { userId: user.id, slug: params.eventSlug, active: true },
    include: { questions: { orderBy: { order: "asc" } } },
  })
  if (!eventType) return notFound()

  // #116 instrumentation — server render path, fire-and-forget (void):
  // - public_page_view carries the slug (spec event list)
  // - session_started is the conversion denominator; the booker's visitId
  //   joins it to booking_started/booking_completed for time-to-book.
  const visitId = crypto.randomUUID()
  void track("public_page_view", {
    userId: user.id,
    meta: { slug: `${params.username}/${params.eventSlug}` },
  })
  void track("session_started", { meta: { visitId } })

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <BookingWidget
        visitId={visitId}
        eventType={{
          id: eventType.id,
          title: eventType.title,
          description: eventType.description,
          duration: eventType.duration,
          location: eventType.location,
          color: eventType.color,
          requirePayment: eventType.requirePayment,
          price: eventType.price,
          currency: eventType.currency,
          questions: eventType.questions.map(q => ({
            id: q.id,
            label: q.label,
            type: q.type,
            required: q.required,
            options: q.options,
          })),
        }}
        host={{
          name: user.name || "",
          image: user.image,
          brandColor: user.brandColor,
          brandLogo: user.brandLogo,
        }}
      />
    </div>
  )
}
