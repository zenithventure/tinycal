import Link from "next/link"
import { Calendar, FileSignature, Check, ArrowRight, Zap } from "lucide-react"

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-600">
            Schedul<span className="text-gray-900">Sign</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">
              Log in
            </Link>
            <Link
              href="/login"
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-sm px-4 py-1.5 rounded-full mb-6">
          <Zap className="w-4 h-4" /> Replace Calendly + DocuSign for $5/mo
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-gray-900 mb-6 text-balance">
          Schedule meetings.<br />Get documents signed.<br />
          <span className="text-blue-600">One platform.</span>
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
          Stop paying $30/mo for two tools. SchedulSign combines professional scheduling 
          and e-signatures in one simple platform — for a fraction of the cost.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/login"
            className="bg-blue-600 text-white px-8 py-3.5 rounded-lg text-lg font-medium hover:bg-blue-700 transition flex items-center gap-2"
          >
            Start Free <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            href="#features"
            className="text-gray-600 px-8 py-3.5 rounded-lg text-lg border hover:bg-gray-50 transition"
          >
            See Features
          </Link>
        </div>
        <p className="text-sm text-gray-400 mt-4">No credit card required · Free plan available</p>
      </section>

      {/* Social proof */}
      <section className="border-y bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-sm text-gray-500 mb-4">TRUSTED BY FREELANCERS & SMALL BUSINESSES</p>
          <div className="flex items-center justify-center gap-8 text-gray-400 text-lg font-medium">
            <span>Consultants</span>
            <span>·</span>
            <span>Coaches</span>
            <span>·</span>
            <span>Agencies</span>
            <span>·</span>
            <span>Freelancers</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-4">Two powerful tools. One simple price.</h2>
        <p className="text-gray-600 text-center mb-12 max-w-xl mx-auto">
          Everything you need to run your business — booking calls and getting contracts signed.
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Scheduling */}
          <div className="border rounded-2xl p-8 hover:shadow-lg transition">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Smart Scheduling</h3>
            <p className="text-gray-600 mb-6">
              Professional booking pages with calendar sync, timezone detection, 
              and automatic meeting links.
            </p>
            <ul className="space-y-2">
              {[
                "Shareable booking links",
                "Google & Outlook calendar sync",
                "Zoom & Google Meet auto-links",
                "Custom availability rules",
                "Email & SMS reminders",
                "Payment collection",
                "Embed on your website",
                "Collective scheduling",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </div>

          {/* E-Signature */}
          <div className="border rounded-2xl p-8 hover:shadow-lg transition">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
              <FileSignature className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold mb-3">E-Signatures</h3>
            <p className="text-gray-600 mb-6">
              Upload documents, place signature fields, and send for signing. 
              Legally binding with full audit trail.
            </p>
            <ul className="space-y-2">
              {[
                "Upload PDF, Word, or image",
                "Drag-and-drop field placement",
                "Draw, type, or upload signature",
                "Sequential signing order",
                "Reusable templates",
                "Audit trail & certificate",
                "Email reminders",
                "Mobile-friendly signing",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "1", title: "Create your event types", desc: "Set your availability, duration, and meeting preferences." },
              { step: "2", title: "Share your booking link", desc: "Send your link or embed it on your website." },
              { step: "3", title: "Get booked & send contracts", desc: "Meetings auto-confirm with reminders. Send docs for signature." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 font-bold">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-4">Simple, honest pricing</h2>
        <p className="text-gray-600 text-center mb-12">
          No hidden fees. No per-seat pricing. Just one low price for everything.
        </p>
        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* Free */}
          <div className="border rounded-2xl p-8">
            <h3 className="text-lg font-semibold mb-1">Free</h3>
            <p className="text-4xl font-bold mb-1">$0</p>
            <p className="text-gray-500 text-sm mb-6">Forever free</p>
            <ul className="space-y-2 mb-8">
              {["1 event type", "3 signature sends/mo", "Basic scheduling", "Google Calendar sync"].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500" /> {f}
                </li>
              ))}
            </ul>
            <Link href="/login" className="block text-center border border-gray-300 py-2.5 rounded-lg hover:bg-gray-50 transition font-medium">
              Get Started
            </Link>
          </div>

          {/* Pro */}
          <div className="border-2 border-blue-600 rounded-2xl p-8 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-3 py-1 rounded-full">
              MOST POPULAR
            </div>
            <h3 className="text-lg font-semibold mb-1">Pro</h3>
            <p className="text-4xl font-bold mb-1">$5<span className="text-lg text-gray-500 font-normal">/mo</span></p>
            <p className="text-gray-500 text-sm mb-6">or $48/year (save 20%)</p>
            <ul className="space-y-2 mb-8">
              {[
                "Unlimited event types",
                "Unlimited signatures",
                "Custom branding",
                "All calendar integrations",
                "SMS reminders",
                "Payment collection",
                "Webhooks & API",
                "Priority support",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-500" /> {f}
                </li>
              ))}
            </ul>
            <Link href="/login" className="block text-center bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition font-medium">
              Start Free Trial
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-blue-600 py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to simplify your workflow?</h2>
          <p className="text-blue-100 mb-8">
            Join thousands of freelancers and businesses who schedule and sign with SchedulSign.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-white text-blue-600 px-8 py-3.5 rounded-lg text-lg font-medium hover:bg-blue-50 transition"
          >
            Get Started Free <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-500">
            © 2026 SchedulSign. All rights reserved.
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <Link href="/privacy" className="hover:text-gray-700">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-700">Terms</Link>
            <a href="mailto:support@schedulsign.com" className="hover:text-gray-700">Support</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
