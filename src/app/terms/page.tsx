import Link from "next/link"

export const metadata = {
  title: "Terms of Service - TinyCal",
}

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="text-xl font-bold text-blue-600">
            Tiny<span className="text-gray-900">Cal</span>
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16 prose prose-gray">
        <h1>Terms of Service</h1>
        <p className="text-gray-500">Last updated: April 1, 2026</p>

        <p>
          These Terms of Service (&quot;Terms&quot;) govern your use of TinyCal, a scheduling platform
          operated by Zenith Studio (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;), accessible at
          tinycal.zenithstudio.app (the &quot;Service&quot;).
        </p>
        <p>By using the Service, you agree to these Terms. If you do not agree, do not use the Service.</p>

        <h2>1. Description of Service</h2>
        <p>
          TinyCal is an online scheduling platform that allows users to create booking pages, manage
          event types, share meeting links, and integrate with third-party calendar and video
          conferencing services. The Service includes free and paid tiers.
        </p>

        <h2>2. Account Registration</h2>
        <ul>
          <li>You must provide accurate information when creating an account</li>
          <li>You are responsible for maintaining the security of your account credentials</li>
          <li>You must be at least 18 years old or the age of majority in your jurisdiction</li>
          <li>One person may not maintain more than one free account</li>
        </ul>

        <h2>3. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any unlawful purpose</li>
          <li>Send spam or unsolicited communications through the Service</li>
          <li>Attempt to gain unauthorized access to other users&apos; accounts or data</li>
          <li>Interfere with or disrupt the Service&apos;s infrastructure</li>
          <li>Use the Service to collect personal information without consent</li>
          <li>Resell or redistribute the Service without authorization</li>
          <li>Use automated means to access the Service beyond normal API usage</li>
        </ul>

        <h2>4. Calendar and Third-Party Integrations</h2>
        <p>
          The Service integrates with third-party services including Google Calendar, Microsoft
          Outlook, Zoom, and Stripe. Your use of these integrations is also subject to the
          respective third-party terms of service. We are not responsible for the availability
          or functionality of third-party services.
        </p>
        <p>
          You authorize us to access your connected calendar data solely for the purpose of
          providing scheduling functionality, including checking availability and creating events.
        </p>

        <h2>5. Meeting Links and Bookings</h2>
        <p>
          When you create a meeting link or booking page, you are responsible for the accuracy
          of the meeting details. Recipients who confirm meetings consent to sharing their
          provided contact information (name, email, phone, LinkedIn) with you as the meeting host.
        </p>

        <h2>6. Payments</h2>
        <p>
          If you enable paid bookings, payments are processed through Stripe. You are responsible
          for complying with applicable tax laws and Stripe&apos;s terms of service. We are not
          responsible for payment disputes between you and your clients.
        </p>

        <h2>7. Free and Paid Plans</h2>
        <p>
          The Service offers a free tier with limited features and paid plans with additional
          capabilities. We reserve the right to modify plan features and pricing with reasonable
          notice. Paid subscriptions are billed in advance and are non-refundable except as
          required by law.
        </p>

        <h2>8. Data and Content</h2>
        <p>
          You retain ownership of any content you submit to the Service (event descriptions,
          custom questions, notes, etc.). By using the Service, you grant us a limited license
          to store, process, and display your content as necessary to provide the Service.
        </p>

        <h2>9. Privacy</h2>
        <p>
          Your use of the Service is also governed by our{" "}
          <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>,
          which describes how we collect, use, and protect your information.
        </p>

        <h2>10. Service Availability</h2>
        <p>
          We strive to maintain high availability but do not guarantee uninterrupted service.
          We may perform maintenance or updates that temporarily affect availability. We are
          not liable for any losses resulting from service interruptions.
        </p>

        <h2>11. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, TinyCal and Zenith Studio shall not be liable
          for any indirect, incidental, special, consequential, or punitive damages, including
          loss of profits, data, or business opportunities, arising from your use of the Service.
        </p>
        <p>
          Our total liability for any claim arising from the Service shall not exceed the amount
          you paid us in the 12 months preceding the claim, or $100, whichever is greater.
        </p>

        <h2>12. Disclaimer of Warranties</h2>
        <p>
          The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind,
          either express or implied, including but not limited to warranties of merchantability,
          fitness for a particular purpose, or non-infringement.
        </p>

        <h2>13. Termination</h2>
        <p>
          You may stop using the Service and delete your account at any time. We may suspend
          or terminate your account if you violate these Terms or for any other reason with
          reasonable notice. Upon termination, your right to use the Service ceases and we
          may delete your data after a reasonable retention period.
        </p>

        <h2>14. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. We will notify you of material changes
          by posting a notice on the Service. Continued use of the Service after changes
          constitutes acceptance of the updated Terms.
        </p>

        <h2>15. Governing Law</h2>
        <p>
          These Terms are governed by the laws of the jurisdiction in which Zenith Studio
          operates, without regard to conflict of law provisions.
        </p>

        <h2>16. Contact Us</h2>
        <p>
          If you have questions about these Terms, contact us at:
        </p>
        <ul>
          <li>Email: support@zenithstudio.io</li>
          <li>Website: <a href="https://tinycal.zenithstudio.app">tinycal.zenithstudio.app</a></li>
        </ul>
      </div>
    </div>
  )
}
