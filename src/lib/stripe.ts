import Stripe from "stripe"

// Use a placeholder key during build if not set
// The actual key will be provided by environment variables at runtime
export const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || "sk_test_placeholder_for_build",
  {
    apiVersion: "2026-01-28.clover",
    typescript: true,
  }
)

export const PLANS = {
  FREE: {
    name: "Free",
    maxEventTypes: 1,
    maxSignatures: 3,
    features: ["1 event type", "3 signature sends/mo", "Basic scheduling"],
  },
  PRO: {
    name: "Pro",
    maxEventTypes: Infinity,
    maxSignatures: Infinity,
    features: [
      "Unlimited event types",
      "Unlimited signatures",
      "Custom branding",
      "All integrations",
      "SMS reminders",
      "Payment collection",
      "Priority support",
    ],
  },
} as const

export async function createCheckoutSession(userId: string, email: string | null, priceId: string) {
  const session = await stripe.checkout.sessions.create({
    customer_email: email ?? undefined,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?canceled=true`,
    metadata: { userId },
  })
  return session
}

export async function createPortalSession(customerId: string) {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
  })
  return session
}
