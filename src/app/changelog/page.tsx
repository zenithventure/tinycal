import Link from "next/link"
import { ChangelogList } from "@/components/changelog-list"
import { MarkChangelogSeen } from "@/components/mark-changelog-seen"
import { changelogEntries } from "@/lib/changelog"

export const metadata = {
  title: "Changelog - TinyCal",
  description: "What's new in TinyCal: release notes, new features, fixes, and breaking changes.",
}

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarkChangelogSeen />
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="text-xl font-bold text-blue-600">
            Tiny<span className="text-gray-900">Cal</span>
          </Link>
        </div>
      </nav>
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900">Changelog</h1>
        <p className="mt-2 mb-10 text-gray-600">New features, fixes, and changes to TinyCal.</p>
        <ChangelogList entries={changelogEntries} />
      </main>
    </div>
  )
}
