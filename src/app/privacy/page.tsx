import Link from "next/link"

export const metadata = {
  title: "Privacy Policy - TinyCal",
}

export default function PrivacyPolicy() {
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
        <h1>Privacy Policy</h1>
        <p className="text-gray-500">Last updated: April 1, 2026</p>

        <p>
          TinyCal (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is operated by Zenith Studio. This Privacy Policy
          explains how we collect, use, and protect your information when you use our scheduling
          platform at tinycal.zenithstudio.app (the &quot;Service&quot;).
        </p>

        <h2>1. Information We Collect</h2>

        <h3>Account Information</h3>
        <p>When you create an account, we collect your name, email address, and profile image through your authentication provider (e.g., Google, Amazon Cognito).</p>

        <h3>Calendar Data</h3>
        <p>
          When you connect a calendar (Google Calendar or Outlook), we access your calendar&apos;s
          free/busy information and event details solely to check availability and create meeting
          events on your behalf. We store OAuth tokens securely to maintain this connection.
        </p>

        <h3>Booking Data</h3>
        <p>
          When someone books a meeting with you, we collect the booker&apos;s name, email address,
          phone number (if provided), timezone, and any answers to custom questions you&apos;ve configured.
        </p>

        <h3>Meeting Link Data</h3>
        <p>
          When you create a shareable meeting link, we may collect the recipient&apos;s name, email,
          phone number, and LinkedIn profile if they choose to provide them during confirmation.
        </p>

        <h3>Usage Data</h3>
        <p>We automatically collect standard server logs including IP addresses, browser type, and pages visited to maintain and improve the Service.</p>

        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To provide scheduling and calendar integration functionality</li>
          <li>To create and manage bookings and meeting links</li>
          <li>To send booking confirmation, reminder, and notification emails</li>
          <li>To check calendar availability and prevent double-bookings</li>
          <li>To create contacts from booking interactions</li>
          <li>To trigger webhooks you have configured</li>
          <li>To process payments through Stripe (if applicable)</li>
          <li>To maintain and improve the Service</li>
        </ul>

        <h2>3. Google API Services</h2>
        <p>
          TinyCal&apos;s use and transfer of information received from Google APIs adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>, including the Limited Use requirements. Specifically:
        </p>
        <ul>
          <li>We only access Google Calendar data necessary to provide scheduling functionality</li>
          <li>We do not use Google Calendar data for advertising purposes</li>
          <li>We do not sell Google Calendar data to third parties</li>
          <li>Calendar data is only shared with meeting participants as part of the booking flow</li>
        </ul>

        <h2>4. Data Sharing</h2>
        <p>We do not sell your personal information. We share data only in the following cases:</p>
        <ul>
          <li><strong>Meeting participants:</strong> Booking details are shared between the host and the person booking (name, email, meeting time, meeting URL)</li>
          <li><strong>Calendar providers:</strong> Event details are sent to Google Calendar or Outlook to create calendar events</li>
          <li><strong>Payment processing:</strong> If you use paid bookings, payment information is processed by Stripe</li>
          <li><strong>Webhooks:</strong> If you configure webhooks, booking data is sent to URLs you specify</li>
          <li><strong>Email delivery:</strong> We use email services to send booking notifications</li>
        </ul>

        <h2>5. Data Storage and Security</h2>
        <p>
          Your data is stored in secure, encrypted databases hosted on Neon (PostgreSQL). OAuth tokens
          are stored encrypted. We use HTTPS for all data transmission. The Service is hosted on
          AWS Amplify / Vercel with industry-standard security measures.
        </p>

        <h2>6. Data Retention</h2>
        <p>
          We retain your account data and booking history for as long as your account is active.
          You can request deletion of your account and associated data at any time by contacting us.
          Calendar OAuth tokens are retained until you disconnect the calendar or delete your account.
        </p>

        <h2>7. Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Access the personal data we hold about you</li>
          <li>Request correction of inaccurate data</li>
          <li>Request deletion of your data</li>
          <li>Disconnect calendar integrations at any time</li>
          <li>Export your booking data</li>
          <li>Revoke Google Calendar access through your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">Google Account permissions</a></li>
        </ul>

        <h2>8. Cookies</h2>
        <p>
          We use essential cookies for authentication and session management. We do not use
          third-party tracking or advertising cookies.
        </p>

        <h2>9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of significant
          changes by posting a notice on the Service.
        </p>

        <h2>10. Contact Us</h2>
        <p>
          If you have questions about this Privacy Policy or wish to exercise your data rights,
          contact us at:
        </p>
        <ul>
          <li>Email: support@zenithstudio.io</li>
          <li>Website: <a href="https://tinycal.zenithstudio.app">tinycal.zenithstudio.app</a></li>
        </ul>
      </div>
    </div>
  )
}
