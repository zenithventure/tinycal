import { ChangelogBadge } from "@/components/changelog-badge"
import { groupByDate, type ChangelogEntry } from "@/lib/changelog"

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  return (
    <div className="space-y-10">
      {groupByDate(entries).map((group) => (
        <section key={group.date}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            <time dateTime={group.date}>{formatDate(group.date)}</time>
          </h2>
          <div className="mt-3 space-y-6">
            {group.entries.map((entry) => (
              <article key={entry.id} className="rounded-lg border border-gray-200 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">{entry.title}</h3>
                  <ChangelogBadge type={entry.type} />
                  {entry.tags?.map((tag) => (
                    <span key={tag} className="text-xs text-gray-500">
                      #{tag}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-gray-600">{entry.description}</p>
                {entry.changes && entry.changes.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {entry.changes.map((change) => (
                      <li key={change.text} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="shrink-0">
                          <ChangelogBadge type={change.type} />
                        </span>
                        <span>{change.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
