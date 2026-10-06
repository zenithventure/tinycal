import { NextResponse } from "next/server"
import { headers } from "next/headers"
import Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import prisma from "@/lib/prisma"

export async function POST(req: Request) {
  const body = await req.text()
  const signature = headers().get("Stripe-Signature")!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.userId
      if (!userId) break

      const subscription = await stripe.subscriptions.retrieve(session.subscription as string)

      await prisma.user.update({
        where: { id: userId },
        data: {
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: subscription.id,
          stripePriceId: subscription.items.data[0].price.id,
          stripeCurrentPeriodEnd: new Date(subscription.items.data[0].current_period_end * 1000),
          plan: "PRO",
        },
      })
      break
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice
      const invoiceSubscription = invoice.parent?.subscription_details?.subscription
      if (!invoiceSubscription) break

      const subscriptionId =
        typeof invoiceSubscription === "string" ? invoiceSubscription : invoiceSubscription.id
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      await prisma.user.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          stripePriceId: subscription.items.data[0].price.id,
          stripeCurrentPeriodEnd: new Date(subscription.items.data[0].current_period_end * 1000),
        },
      })
      break
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription
      await prisma.user.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: { plan: "FREE", stripeSubscriptionId: null, stripePriceId: null },
      })
      break
    }
  }

  return NextResponse.json({ received: true })
}
