import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import prisma from "@/lib/prisma"

// Create a payment intent for paid bookings
export async function POST(req: Request) {
  const { bookingId } = await req.json()

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { eventType: true },
  })
  if (!booking || !booking.eventType.requirePayment || !booking.eventType.price) {
    return NextResponse.json({ error: "Invalid booking" }, { status: 400 })
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: booking.eventType.currency,
        product_data: { name: booking.eventType.title },
        unit_amount: booking.eventType.price // already integer cents,
      },
      quantity: 1,
    }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/booking/confirmed/${booking.uid}?paid=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/booking/confirmed/${booking.uid}?paid=false`,
    metadata: { bookingId: booking.id },
  })

  await prisma.booking.update({
    where: { id: bookingId },
    data: { stripePaymentIntentId: session.id },
  })

  return NextResponse.json({ url: session.url })
}
